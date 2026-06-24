import { createSignal } from 'solid-js'

/**
 * Page-wide "is WebGPU healthy?" signal, shared across every Solid island (they
 * all import this one module instance from the bundle, so the signal is global
 * to the page). Live flames read `webgpuLive()`; only a genuine **device loss**
 * (the GPU device is actually gone, so every flame is dead anyway) latches the
 * whole page to its static posters — the "live by default, poster on failure"
 * behaviour.
 *
 * NB: a single `uncapturederror` does NOT trigger the fallback. It's far too
 * broad a signal — one transient/recoverable error from one flame (common on
 * mobile GPUs under load) would otherwise freeze EVERY flame on the page.
 */
const [healthy, setHealthy] = createSignal(true)

/** Sync support probe — false when the browser advertises no WebGPU at all
 *  (old Safari, Firefox without the flag). No async adapter request. */
export function webgpuSupported(): boolean {
  // globalThis.navigator: bare `navigator` is eslint-restricted (no-restricted-globals).
  const nav = globalThis.navigator
  return typeof nav !== 'undefined' && 'gpu' in nav
}

/** Reactive: may live GPU flames run? False once support is missing or a GPU
 *  failure has fired. Latches false — never flips back (avoids OOM flip-flop). */
export function webgpuLive(): boolean {
  return webgpuSupported() && healthy()
}

let failed = false
/** Permanently flip the page to posters on the first GPU failure. Idempotent. */
export function reportGpuFailure(reason: string): void {
  if (failed) return
  failed = true
  console.warn(`[landing] WebGPU disabled, falling back to posters — ${reason}`)
  setHealthy(false)
}

let renderLogged = false
/** One-time diagnostic: confirms a live flame is actually accumulating (so the
 *  static images you see ARE the real renderer, not posters). */
export function markLiveRender(): void {
  if (renderLogged) return
  renderLogged = true
  console.info(
    '[landing][diag] live WebGPU render confirmed — a flame is accumulating',
  )
}

// One-time support diagnostic on the client, so device testing can tell whether
// posters are showing because WebGPU is simply unavailable (no errors in that
// case — it's a silent, graceful fallback).
if (typeof globalThis.navigator !== 'undefined') {
  console.info(
    `[landing][diag] WebGPU navigator.gpu = ${webgpuSupported()}${
      webgpuSupported()
        ? ' (supported — live flames should render)'
        : ' (NOT available → static posters only; on iOS enable Settings → Safari → Advanced → Feature Flags → WebGPU, or update to iOS 18+)'
    }`,
  )
}

const watched = new WeakSet<GPUDevice>()
/**
 * Attach failure listeners to a device once (it's a cached singleton shared
 * across all Roots, so this no-ops after the first call). Uncaptured errors are
 * only LOGGED — they must not kill live rendering for the whole page. The poster
 * fallback fires solely on a real device loss (driver reset / fatal OOM), where
 * all GPU work is dead regardless.
 */
export function watchDevice(device: GPUDevice): void {
  if (watched.has(device)) return
  watched.add(device)
  device.addEventListener('uncapturederror', (e) => {
    console.warn(
      '[landing] WebGPU uncaptured error (rendering continues):',
      (e as GPUUncapturedErrorEvent).error.message,
    )
  })
  device.lost
    .then((info) => {
      // 'destroyed' is an intentional teardown (Root unmount), not a failure.
      if (info.reason !== 'destroyed') {
        reportGpuFailure(`device lost: ${info.message}`)
      }
    })
    .catch(() => {})
}
