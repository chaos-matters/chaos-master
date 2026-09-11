// Motion blur for animation export: the sub-frame stepping rule, shared by the
// main-canvas path (utils/animationExport.ts) and the offscreen export job
// (components/ExportJobs/OffscreenAnimationRender.tsx). One rule, so a
// background render and a main-canvas render of the same timeline match.
//
// Blur is N sub-frames accumulated into one buffer at limit/N points each: the
// same point budget as a sharp frame, spread across N shutter positions.

/** The export dialog has no shutter control; both paths use a half-frame shutter. */
export const DEFAULT_SHUTTER_ANGLE = 180

export type MotionBlurSettings = {
  motionBlurSamples: number
  shutterAngle: number
}

function sampleCount(samples: number): number {
  return Number.isFinite(samples) && samples >= 1 ? Math.floor(samples) : 1
}

/** The blur settings an export carries, built the same way for both paths. */
export function motionBlurSettings(samples: number): MotionBlurSettings {
  return {
    motionBlurSamples: sampleCount(samples),
    shutterAngle: DEFAULT_SHUTTER_ANGLE,
  }
}

/**
 * Sub-frame offsets within one frame, in frames. A 180 degree shutter covers
 * half a frame, so N samples sit at 0, d/N, 2d/N ... where d = angle / 360.
 */
export function subFrameOffsets(
  samples: number,
  shutterAngle: number,
): number[] {
  const n = sampleCount(samples)
  if (n === 1) return [0]
  const duration = shutterAngle / 360
  return Array.from({ length: n }, (_, i) => (i / n) * duration)
}

/** Cumulative point budget once sub-frame `subIndex` is done. */
export function subFrameLimit(
  subIndex: number,
  samples: number,
  limit: number,
): number {
  return Math.round(((subIndex + 1) / sampleCount(samples)) * limit)
}

/**
 * Iterations for one export tick under motion blur: enough to reach this
 * sub-frame's share of the budget and no more, but always at least one so the
 * loop keeps moving. Uncapped, the export driver planned a tick that reached
 * the whole budget at once, and every later sub-frame accumulated nothing.
 */
export function exportTickIterations(
  planned: number,
  remainingPoints: number,
  pointsPerIteration: number,
): number {
  return Math.max(
    1,
    Math.min(planned, Math.ceil(remainingPoints / pointsPerIteration)),
  )
}
