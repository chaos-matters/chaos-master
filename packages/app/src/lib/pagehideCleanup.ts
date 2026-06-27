import { PAGEHIDE_CLEANUP } from '@/defaults'
import { vramLog } from '@/utils/vramLog'

/**
 * EXPERIMENT (flag-gated by PAGEHIDE_CLEANUP / VITE_PAGEHIDE_CLEANUP, default
 * OFF): run registered GPU teardown SYNCHRONOUSLY on a real page unload/reload.
 *
 * Why: Firefox reloads so fast that neither Solid's onCleanup nor the deferred
 * `device.queue.onSubmittedWorkDone().then(destroy)` runs before the reloaded
 * page starts allocating — so the old page's VRAM is still held during the new
 * page's init. On the GFX1201 GPU that transient double pressure can tip the GPU
 * process over (the "reload doesn't recover" case).
 *
 * What it does NOT do: it never calls `GPUDevice.destroy()`. Destroying a device
 * after submitted work hits an upstream wgpu-hal panic that crashes the Firefox
 * GPU process (deno/deno#21648; matches this repo's own history — see Root.tsx).
 * Callers register `() => root.destroy()` instead, which only frees that root's
 * buffers/textures and is already used safely in onCleanup during rendering.
 *
 * bfcache: skipped when `event.persisted` is true (the page is being frozen for
 * the back/forward cache, not unloaded) so a restored page isn't left with
 * destroyed resources.
 */
type Teardown = () => void

const teardowns = new Set<Teardown>()
let listenerAttached = false

function onPageHide(event: PageTransitionEvent) {
  if (event.persisted) {
    return
  }
  vramLog(`[pagehide] running ${teardowns.size} GPU teardown(s) before unload`)
  for (const teardown of teardowns) {
    try {
      teardown()
    } catch {
      // The page is unloading — "buffer used while destroyed" validation errors
      // from tearing down in-flight resources are moot here.
    }
  }
}

/**
 * Register a teardown to run on real page unload. Returns an unregister fn.
 * No-op (and registers nothing) when the experiment flag is off.
 */
export function registerPagehideTeardown(teardown: Teardown): () => void {
  if (!PAGEHIDE_CLEANUP) {
    return () => {}
  }
  teardowns.add(teardown)
  if (!listenerAttached) {
    window.addEventListener('pagehide', onPageHide)
    listenerAttached = true
  }
  return () => {
    teardowns.delete(teardown)
  }
}
