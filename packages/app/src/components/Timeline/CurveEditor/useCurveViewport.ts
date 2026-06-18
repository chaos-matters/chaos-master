/**
 * Pure coordinate math for the curve editor graph: maps between (frame, value)
 * data space and (x, y) pixel space, with an inset padding and a value range
 * auto-fitted to the keyframes. No DOM, no reactivity — trivially unit-testable
 * (mirrors JWildfire's EnvelopeView scale/translate, value-axis inverted).
 */

export interface CurveViewportInput {
  /** Pixel size of the drawable area. */
  width: number
  height: number
  /** Frame (x) range shown across the width. */
  startFrame: number
  endFrame: number
  /** Value (y) range shown across the height. */
  minValue: number
  maxValue: number
  /** Inset in px so nodes near the edges aren't clipped. */
  padding?: number
}

export interface CurveViewport extends Required<CurveViewportInput> {
  frameToX(frame: number): number
  valueToY(value: number): number
  xToFrame(x: number): number
  yToValue(y: number): number
}

const DEFAULT_PADDING = 12

export function createCurveViewport(input: CurveViewportInput): CurveViewport {
  const padding = input.padding ?? DEFAULT_PADDING
  const { width, height, startFrame, endFrame, minValue, maxValue } = input

  const innerW = Math.max(1, width - 2 * padding)
  const innerH = Math.max(1, height - 2 * padding)
  const frameSpan = endFrame - startFrame || 1
  const valueSpan = maxValue - minValue || 1

  return {
    ...input,
    padding,
    frameToX(frame) {
      return padding + ((frame - startFrame) / frameSpan) * innerW
    },
    valueToY(value) {
      // Inverted: the max value sits at the top of the box.
      return padding + ((maxValue - value) / valueSpan) * innerH
    },
    xToFrame(x) {
      return startFrame + ((x - padding) / innerW) * frameSpan
    },
    yToValue(y) {
      return maxValue - ((y - padding) / innerH) * valueSpan
    },
  }
}

/**
 * Auto-fit a value range to a set of keyframe values, with headroom so the curve
 * doesn't touch the edges. Handles empty (→ [0, 1]) and flat (→ value ± 1) data.
 */
export function autoValueRange(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 }
  let lo = values[0]!
  let hi = values[0]!
  for (const v of values) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (hi - lo < 1e-9) return { min: lo - 1, max: hi + 1 }
  const pad = (hi - lo) * 0.15
  return { min: lo - pad, max: hi + pad }
}
