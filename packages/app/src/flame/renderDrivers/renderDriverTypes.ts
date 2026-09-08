export const EXPORT_TARGET_TICK_MS = 32
export const EXPORT_TICK_GROW_BELOW_MS = 24
export const EXPORT_TICK_SHRINK_ABOVE_MS = 48
export const EXPORT_INITIAL_ITERATIONS = 2
export const EXPORT_MAX_ITERATIONS = 512
export const EXPORT_IDLE_DELAY_MS = 8
export const EXPORT_PRESENT_INTERVAL_MS = 250
export const EXPORT_LOG_INTERVAL_MS = 2000
export const EXPORT_SLOW_TICK_MS = 300
export const EXPORT_COUNT_SIGNAL_INTERVAL_MS = 100
export const EXPORT_FENCE_TIMEOUT_MS = 2000

export type RenderTickResult = {
  iterations: number
  presented: boolean
  hadWork: boolean
}

export type CompletedPointCountInfo = {
  /** Cumulative plotted-point count captured for this exact submission. */
  count: number
  /** Queue-fenced completion time from performance.now(). */
  completedAtMs: number
}

export interface InteractiveRenderDriverOptions {
  renderTick: (frameId: number) => RenderTickResult
  renderInterval: () => number
  continueRendering: () => boolean
  hasAccumulatedPoints?: () => boolean
  latestQueueFence?: () => Promise<void> | undefined
  exportDriverActive: () => boolean
  gpuReady: () => boolean
  presentToCanvas: () => void
  isAppleWebKit?: () => boolean
  isExportRenderer?: () => boolean
  onStallResumed?: () => void
}

export interface InteractiveRenderDriver {
  redraw: () => void
}

export interface ExportRenderDriverOptions {
  exportDriverActive: () => boolean
  gpuReady: () => boolean
  renderTick: (frameId: number) => RenderTickResult
  latestQueueFence?: () => Promise<void> | undefined
  pointCountPerBatch: () => number
  plotsPerChainBaked: () => number
}

export interface ExportRenderDriver {
  wake: () => void
  getExportIterationCount: () => number
}
