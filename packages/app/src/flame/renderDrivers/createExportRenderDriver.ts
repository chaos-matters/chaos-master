import { createEffect, onCleanup } from 'solid-js'
import { DEBUG_MODE } from '@/defaults'
import { formatPointCount } from '@/utils/formatPointCount'
import { logTime } from '@/utils/logTime'
import { EXPORT_FENCE_TIMEOUT_MS, EXPORT_IDLE_DELAY_MS, EXPORT_INITIAL_ITERATIONS, EXPORT_LOG_INTERVAL_MS, EXPORT_MAX_ITERATIONS, EXPORT_SLOW_TICK_MS, EXPORT_TARGET_TICK_MS, EXPORT_TICK_GROW_BELOW_MS, EXPORT_TICK_SHRINK_ABOVE_MS, } from './renderDriverTypes'
import type { ExportRenderDriver, ExportRenderDriverOptions, RenderTickResult, } from './renderDriverTypes'

const { performance } = globalThis

/**
 * Await the queue fence (onSubmittedWorkDone) with an explicit timeout safeguard.
 * Mobile WebGPU queues can transiently reject during backgrounding or memory pressure.
 */
export async function awaitExportQueueFence(
  fencePromise: Promise<void> | undefined,
): Promise<void> {
  if (!fencePromise) return

  let timerId: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      fencePromise,
      new Promise<void>((resolve) => {
        timerId = setTimeout(resolve, EXPORT_FENCE_TIMEOUT_MS)
      }),
    ])
  } catch (err) {
    // Mobile WebGPU queues (WebKit/Android) can transiently reject
    // onSubmittedWorkDone() during backgrounding or memory pressure events.
    // Do not break the driving loop; if the device was genuinely lost,
    // options.gpuReady() will evaluate to false and cleanly stop driving.
    if (DEBUG_MODE) {
      console.warn(
        `[ExportDriver ${logTime()}] queue fence rejected; continuing export loop`,
        err,
      )
    }
  } finally {
    if (timerId !== undefined) {
      clearTimeout(timerId)
    }
  }
}

/**
 * Calculate the next export iteration count based on elapsed tick duration.
 * Presentation ticks are skipped because filter/grading passes skew wall time.
 */
export function calculateNextExportIterations(
  currentIterations: number,
  tickMs: number,
  iterationsRan: number,
  presented: boolean,
): number {
  if (iterationsRan <= 0 || presented) {
    return currentIterations
  }

  // Dual-rate controller (presentation ticks are skipped: their
  // wall time includes the filter/grading passes and would skew it).
  if (tickMs < EXPORT_TICK_GROW_BELOW_MS) {
    // Clearly latency-bound — the fixed await floor dominates, so
    // more iterations are effectively free. Double.
    return Math.min(currentIterations * 2, EXPORT_MAX_ITERATIONS)
  }

  if (tickMs <= EXPORT_TICK_SHRINK_ABOVE_MS) {
    // Inside the band — creep upward to find the point
    // where GPU time, not latency, sets the pace.
    return Math.min(Math.ceil(currentIterations * 1.25), EXPORT_MAX_ITERATIONS)
  }

  // The chunk itself overshot the budget — shrink proportionally.
  return Math.max(
    Math.ceil(currentIterations * (EXPORT_TARGET_TICK_MS / tickMs)),
    1,
  )
}

interface ExportTelemetry {
  windowStartMs: number
  windowPoints: number
  windowTickMs: number
  windowTicks: number
}

function createExportTelemetry(): ExportTelemetry {
  return {
    windowStartMs: performance.now(),
    windowPoints: 0,
    windowTickMs: 0,
    windowTicks: 0,
  }
}

function recordExportTelemetry(
  telemetry: ExportTelemetry,
  tick: RenderTickResult,
  tickMs: number,
  options: ExportRenderDriverOptions,
  chunkIterations: number,
): void {
  telemetry.windowPoints +=
    tick.iterations *
    options.pointCountPerBatch() *
    options.plotsPerChainBaked()
  telemetry.windowTickMs += tickMs
  telemetry.windowTicks += 1

  if (DEBUG_MODE && tickMs > EXPORT_SLOW_TICK_MS) {
    console.info(
      `[ExportDriver ${logTime()}] slow tick: ${tickMs.toFixed(0)}ms for a ${tick.iterations}-iteration chunk${tick.presented ? ' (presented)' : ''}`,
    )
  }

  const nowMs = performance.now()
  if (nowMs - telemetry.windowStartMs >= EXPORT_LOG_INTERVAL_MS) {
    if (DEBUG_MODE) {
      const seconds = (nowMs - telemetry.windowStartMs) / 1000
      const avgTickMs =
        telemetry.windowTickMs / Math.max(telemetry.windowTicks, 1)
      console.info(
        `[ExportDriver ${logTime()}] ${formatPointCount(telemetry.windowPoints / seconds)} pts/s | ${telemetry.windowTicks} ticks, avg ${avgTickMs.toFixed(1)}ms | chunk=${chunkIterations} iters`,
      )
    }
    telemetry.windowStartMs = nowMs
    telemetry.windowPoints = 0
    telemetry.windowTickMs = 0
    telemetry.windowTicks = 0
  }
}

/**
 * Export render driver: replaces the rAF loop while an export runs.
 *
 * The loop awaits each submission fence, so at most one chunk is in flight.
 * The browser compositor never sees a deep GPU queue (preventing rAF collapse in Chrome),
 * the export keeps running in background tabs, and chunk wall time provides an accurate
 * measurement to adaptively size the next chunk.
 */
export function createExportRenderDriver(
  options: ExportRenderDriverOptions,
): ExportRenderDriver {
  let exportIterationCount = EXPORT_INITIAL_ITERATIONS
  let notifyExportWork: (() => void) | undefined

  createEffect(() => {
    // Stop driving on device loss too: a reactive !gpuReady() re-runs this
    // effect, fires onCleanup (disposed = true) and breaks the export loop.
    if (!options.exportDriverActive() || !options.gpuReady()) return

    let disposed = false
    onCleanup(() => {
      disposed = true
      notifyExportWork = undefined
    })

    exportIterationCount = EXPORT_INITIAL_ITERATIONS
    let exportFrameId = 0

    // Telemetry — timestamped so stalls can be correlated with tab
    // switches, window moves and occlusion.
    const telemetry = createExportTelemetry()
    let idleSinceMs: number | undefined

    if (DEBUG_MODE) {
      const onVisibilityChange = () => {
        console.info(
          `[ExportDriver ${logTime()}] document became ${document.visibilityState}`,
        )
      }
      document.addEventListener('visibilitychange', onVisibilityChange)
      onCleanup(() => {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      })
    }

    const loop = async () => {
      // Leave the effect's tracking scope before the first tick so signal
      // reads inside renderTick don't become dependencies of this effect.
      await Promise.resolve()

      while (!disposed) {
        const startMs = performance.now()
        const tick = options.renderTick(exportFrameId++)

        if (!tick.hadWork) {
          // Waiting for a capture or the next frame's descriptor.
          // Event-driven wake (wake()) with a timer backstop; the
          // timer alone could be clamped to 1Hz in hidden/occluded windows.
          idleSinceMs ??= startMs
          await new Promise<void>((resolve) => {
            notifyExportWork = resolve
            setTimeout(resolve, EXPORT_IDLE_DELAY_MS)
          })
          notifyExportWork = undefined
          continue
        }

        if (idleSinceMs !== undefined) {
          const idleMs = startMs - idleSinceMs
          if (DEBUG_MODE && idleMs > 1000) {
            console.info(
              `[ExportDriver ${logTime()}] resumed work after ${(idleMs / 1000).toFixed(1)}s idle`,
            )
          }
          idleSinceMs = undefined
        }

        if (!options.gpuReady()) {
          break
        }

        await awaitExportQueueFence(options.latestQueueFence?.())

        const tickMs = performance.now() - startMs
        recordExportTelemetry(
          telemetry,
          tick,
          tickMs,
          options,
          exportIterationCount,
        )

        exportIterationCount = calculateNextExportIterations(
          exportIterationCount,
          tickMs,
          tick.iterations,
          tick.presented,
        )
      }
    }
    void loop()
  })

  return {
    wake: () => {
      notifyExportWork?.()
    },
    getExportIterationCount: () => exportIterationCount,
  }
}
