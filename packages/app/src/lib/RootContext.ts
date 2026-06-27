import { createContext } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'
import type { TgpuRoot } from 'typegpu'

/**
 * The Root context is ALWAYS provided, even when WebGPU is unavailable, so the
 * app shell stays mounted and navigable instead of being replaced by a
 * full-screen notice. In the degraded case adapter/device/root are null and
 * `gpuReady()` is false; GPU-dependent subtrees are gated on `gpuReady()` (see
 * AutoCanvas) and never run against a null device.
 */
export type RootContextValue = {
  adapter: GPUAdapter | null
  device: GPUDevice | null
  root: TgpuRoot | null
  /** Reactive: true only while a live device is available. */
  gpuReady: () => boolean
}

const RootContext = createContext<RootContextValue>()

export const RootContextProvider = RootContext.Provider

export function useRootContext() {
  return useContextSafe(RootContext, 'useRootContext', 'RootContext')
}

/** Non-null view of the context, for the device/root shape. */
export type LiveRootContextValue = {
  adapter: GPUAdapter
  device: GPUDevice
  root: TgpuRoot
  gpuReady: () => boolean
}

/**
 * For GPU consumers (Flam3, cameras, the AffineEditor/FlameColorEditor canvases)
 * that are only ever mounted inside AutoCanvas's `gpuReady()` gate, so a live
 * device is guaranteed. Asserts non-null once at the call site instead of
 * threading null-checks through every per-frame GPU call. If it ever throws, a
 * GPU consumer was mounted without a device — a bug, not the unavailable path.
 */
export function useLiveRootContext(): LiveRootContextValue {
  const ctx = useRootContext()
  if (!ctx.adapter || !ctx.device || !ctx.root) {
    throw new Error('useLiveRootContext requires a live GPU device.', {
      cause: 'WebGPU',
    })
  }
  return ctx as LiveRootContextValue
}
