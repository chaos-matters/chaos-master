/**
 * What a sideways drag on the panel's number fields does to their values.
 * c moves by a thousandth per CSS pixel (a ten-thousandth with Shift), and
 * the iteration limit doubles every 100 px, on a log scale because it spans
 * 16 to four million, landing on two significant figures.
 */
import { clampIterations, explorerDecimal, MAX_ITERATIONS, MIN_ITERATIONS, } from '@chaos-master/core'

const { log2, max, min } = Math

export const C_PER_PIXEL = 0.001
export const PIXELS_PER_DOUBLING = 100

/** A dragged c as a field shows it: five decimals at most. */
export function scrubbedDecimal(value: number): string | undefined {
  let text = value.toFixed(5).replace(/0+$/, '').replace(/\.$/, '')
  if (text === '-0') text = '0'
  return explorerDecimal(text)
}

/** log2 of the iteration limit, kept inside the limits it may take. */
export function clampedLog2(value: number): number {
  return min(log2(MAX_ITERATIONS), max(log2(MIN_ITERATIONS), value))
}

/** The iteration limit at `log2Value`, on two significant figures. */
export function scrubbedIterations(log2Value: number): number {
  return clampIterations(Number((2 ** log2Value).toPrecision(2)))
}
