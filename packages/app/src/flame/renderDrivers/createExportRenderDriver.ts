import { createEffect, onCleanup } from 'solid-js'
import { DEBUG_MODE } from '@/defaults'
import { formatPointCount } from '@/utils/formatPointCount'
import { logTime } from '@/utils/logTime'
import { EXPORT_FENCE_TIMEOUT_MS, EXPORT_IDLE_DELAY_MS, EXPORT_INITIAL_ITERATIONS, EXPORT_LOG_INTERVAL_MS, EXPORT_MAX_ITERATIONS, EXPORT_SLOW_TICK_MS, EXPORT_TARGET_TICK_MS, EXPORT_TICK_GROW_BELOW_MS, EXPORT_TICK_SHRINK_ABOVE_MS, } from './renderDriverTypes'
import type { ExportRenderDriver, ExportRenderDriverOptions, } from './renderDriverTypes'

const { performance } = globalThis

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
    let windowStartMs = performance.now()
    let windowPoints = 0
    let windowTickMs = 0
    let windowTicks = 0
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
            setTimeout(() => {
              resolve()
            }, EXPORT_IDLE_DELAY_MS)
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

        const fencePromise = options.latestQueueFence?.()
        if (fencePromise) {
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

        const tickMs = performance.now() - startMs
        windowPoints +=
          tick.iterations *
          options.pointCountPerBatch() *
          options.plotsPerChainBaked()
        windowTickMs += tickMs
        windowTicks += 1

        if (DEBUG_MODE && tickMs > EXPORT_SLOW_TICK_MS) {
          console.info(
            `[ExportDriver ${logTime()}] slow tick: ${tickMs.toFixed(0)}ms for a ${tick.iterations}-iteration chunk${tick.presented ? ' (presented)' : ''}`,
          )
        }

        const nowMs = performance.now()
        if (nowMs - windowStartMs >= EXPORT_LOG_INTERVAL_MS) {
          if (DEBUG_MODE) {
            const seconds = (nowMs - windowStartMs) / 1000
            const avgTickMs = windowTickMs / Math.max(windowTicks, 1)
            console.info(
              `[ExportDriver ${logTime()}] ${formatPointCount(windowPoints / seconds)} pts/s | ${windowTicks} ticks, avg ${avgTickMs.toFixed(1)}ms | chunk=${exportIterationCount} iters`,
            )
          }
          windowStartMs = nowMs
          windowPoints = 0
          windowTickMs = 0
          windowTicks = 0
        }

        if (tick.iterations > 0 && !tick.presented) {
          // Dual-rate controller (presentation ticks are skipped: their
          // wall time includes the filter/grading passes and would skew it).
          if (tickMs < EXPORT_TICK_GROW_BELOW_MS) {
            // Clearly latency-bound — the fixed await floor dominates, so
            // more iterations are effectively free. Double.
            exportIterationCount = Math.min(
              exportIterationCount * 2,
              EXPORT_MAX_ITERATIONS,
            )
          } else if (tickMs <= EXPORT_TICK_SHRINK_ABOVE_MS) {
            // Inside the band — creep upward to find the point
            // where GPU time, not latency, sets the pace.
            exportIterationCount = Math.min(
              Math.ceil(exportIterationCount * 1.25),
              EXPORT_MAX_ITERATIONS,
            )
          } else {
            // The chunk itself overshot the budget — shrink proportionally.
            exportIterationCount = Math.max(
              Math.ceil(
                exportIterationCount * (EXPORT_TARGET_TICK_MS / tickMs),
              ),
              1,
            )
          }
        }
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
