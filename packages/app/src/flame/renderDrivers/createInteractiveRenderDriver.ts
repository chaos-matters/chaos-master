import { createEffect, untrack } from 'solid-js'
import { createAnimationFrame } from '@/utils/createAnimationFrame'
import { isAppleWebKit as defaultIsAppleWebKit } from '@/utils/platform'
import type { InteractiveRenderDriver, InteractiveRenderDriverOptions, } from './renderDriverTypes'

/**
 * Interactive render driver driven by requestAnimationFrame (rAF).
 *
 * Owns:
 * - The primary convergence loop throttled by props.renderInterval.
 * - The Apple WebKit present pump (re-presenting canvas to avoid stale swapchain buffers).
 * - Automatic redraw request when the render interval drops from Infinity back to finite.
 */
export function createInteractiveRenderDriver(
  options: InteractiveRenderDriverOptions,
): InteractiveRenderDriver {
  const isWebKit = options.isAppleWebKit ?? defaultIsAppleWebKit

  const rafLoop = createAnimationFrame(
    (frameId) => {
      options.renderTick(frameId)
    },
    () => (options.continueRendering() ? options.renderInterval() : Infinity),
    () => options.latestQueueFence?.() ?? Promise.resolve(),
    // Tear the rAF loop down entirely when an export takes over OR when the
    // device is lost. The `!gpuReady()` read is reactive, so a device loss
    // disposes every preview's loop on the spot (no more requestAnimationFrame,
    // no more onSubmittedWorkDone holds against a dead queue).
    () => options.exportDriverActive() || !options.gpuReady(),
  )

  // Present pump (Apple WebKit only): a WebGPU canvas that isn't drawn every
  // frame shows stale swapchain buffers. The interactive loop above only
  // presents when an IFS batch completes — on a slow GPU that can be
  // 100-200ms apart during a load, long enough for WebKit to flash the
  // previous flame between presents. Re-present the current image every frame
  // while the flame is still accumulating so no gap is ever visible.
  createAnimationFrame(
    () => {
      if (!options.gpuReady() || options.exportDriverActive()) return
      // Skip the pre-first-present window (no accumulation yet - avoid black flash)
      // and stop once quality is reached.
      if (
        (options.hasAccumulatedPoints && !options.hasAccumulatedPoints()) ||
        !options.continueRendering()
      ) {
        return
      }
      options.presentToCanvas()
    },
    0,
    undefined,
    () =>
      !isWebKit() ||
      options.exportDriverActive() ||
      !options.gpuReady() ||
      !Number.isFinite(options.renderInterval()) ||
      !(options.isExportRenderer?.() ?? false),
  )

  // When the render interval drops from Infinity (modal closed) back to a
  // finite rate, force an immediate redraw so the first frame appears without
  // waiting for the next rAF delta-time check.
  let renderIntervalWasFinite = untrack(() =>
    Number.isFinite(options.renderInterval()),
  )
  createEffect(() => {
    const finite = Number.isFinite(options.renderInterval())
    const resumedFromStall = finite && !renderIntervalWasFinite
    renderIntervalWasFinite = finite
    if (resumedFromStall) {
      options.onStallResumed?.()
      rafLoop.redraw()
    }
  })

  return {
    redraw: () => {
      rafLoop.redraw()
    },
  }
}
