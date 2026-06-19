/**
 * Pure coordinate math for the curve editor graph. The X axis is deliberately
 * the SAME mapping the dope sheet uses for its diamonds — `(frame - startFrame) *
 * frameWidth` — so the graph sits inside a scroll-synced lane and lines up pixel
 * for pixel with the tracks below it. The Y axis auto-fits the value range with a
 * vertical inset (`padY`). No DOM, no reactivity — unit-testable.
 */

export interface CurveViewportInput {
  /** Pixels per frame — must match the dope sheet's frameWidth. */
  frameWidth: number
  /** First frame (x origin). */
  startFrame: number
  /** Pixel height of the lane. */
  height: number
  /** Value (y) range shown across the height. */
  minValue: number
  maxValue: number
  /** Vertical inset in px so nodes near the top/bottom aren't clipped. */
  padY?: number
}

export interface CurveViewport extends Required<CurveViewportInput> {
  frameToX(frame: number): number
  valueToY(value: number): number
  xToFrame(x: number): number
  yToValue(y: number): number
}

const DEFAULT_PAD_Y = 14

export function createCurveViewport(input: CurveViewportInput): CurveViewport {
  const padY = input.padY ?? DEFAULT_PAD_Y
  const { frameWidth, startFrame, height, minValue, maxValue } = input

  const innerH = Math.max(1, height - 2 * padY)
  const valueSpan = maxValue - minValue || 1
  const fw = frameWidth || 1

  return {
    ...input,
    padY,
    // X matches the dope sheet exactly (diamonds are centered on this x).
    frameToX(frame) {
      return (frame - startFrame) * frameWidth
    },
    xToFrame(x) {
      return startFrame + x / fw
    },
    // Inverted: the max value sits at the top of the box.
    valueToY(value) {
      return padY + ((maxValue - value) / valueSpan) * innerH
    },
    yToValue(y) {
      return maxValue - ((y - padY) / innerH) * valueSpan
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
