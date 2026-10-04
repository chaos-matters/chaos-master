/**
 * Moving a view value along a CSS timing curve, for a value the compositor
 * cannot transition: the camera's framing above the editor rail's glass
 * sheet (CanvasViewport.tsx), which must follow the sheet's own height
 * transition as the canvas's translate does with the setting off.
 *
 * `cubicBezier` evaluates a `cubic-bezier()` timing function the way the
 * browser does, solving the curve's x for the time and reading its y as the
 * progress. `createEasedValue` steps a number along one, a frame at a time.
 */
import { createEffect, createSignal, on, onCleanup, untrack } from 'solid-js'
import type { Accessor } from 'solid-js'

/** The four control values of a CSS `cubic-bezier(x1, y1, x2, y2)`. */
export type CubicBezierPoints = readonly [number, number, number, number]

/**
 * The timing function `cubic-bezier(x1, y1, x2, y2)`: time from 0 to 1 in,
 * progress out, 0 at 0 and 1 at 1. The x values lie in 0 to 1, as CSS
 * requires, so the curve's x rises with its parameter and has one solution.
 */
export function cubicBezier([x1, y1, x2, y2]: CubicBezierPoints): (
  time: number,
) => number {
  // The curve's polynomial coefficients, its ends fixed at (0, 0) and (1, 1).
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const xAt = (s: number) => ((ax * s + bx) * s + cx) * s
  const yAt = (s: number) => ((ay * s + by) * s + cy) * s
  const slopeAt = (s: number) => (3 * ax * s + 2 * bx) * s + cx

  /** The parameter whose x is `x`: Newton's method, then bisection if it stalls. */
  function parameterFor(x: number): number {
    let s = x
    for (let step = 0; step < 8; step++) {
      const error = xAt(s) - x
      if (Math.abs(error) < 1e-7) return s
      const slope = slopeAt(s)
      if (Math.abs(slope) < 1e-6) break
      s -= error / slope
      if (s < 0 || s > 1) break
    }
    let low = 0
    let high = 1
    s = x
    for (let step = 0; step < 50 && high - low > 1e-9; step++) {
      if (xAt(s) < x) low = s
      else high = s
      s = (low + high) / 2
    }
    return s
  }

  return (time) => {
    if (!(time > 0)) return 0
    if (time >= 1) return 1
    return yAt(parameterFor(time))
  }
}

export interface EasedValueOptions {
  /** How long a move takes, in ms. */
  durationMs: number
  /** Progress over time, both 0 to 1, such as a `cubicBezier`. */
  easing: (time: number) => number
  /** While true, the value goes to its target at once. */
  instant?: Accessor<boolean>
}

/**
 * `target`, reached over `options.durationMs` along `options.easing` rather
 * than at once. A new target starts a new move from wherever the value had
 * got to. Each animation frame writes one step; the first frame of a move
 * writes where it starts, as a CSS transition's first frame does. The value
 * jumps while `instant` holds, and where there are no animation frames.
 */
export function createEasedValue(
  target: Accessor<number>,
  options: EasedValueOptions,
): Accessor<number> {
  const [value, setValue] = createSignal(untrack(target))
  let frame: number | undefined

  const stop = () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
  }

  createEffect(
    on(
      target,
      (to) => {
        stop()
        const from = untrack(value)
        if (
          from === to ||
          options.durationMs <= 0 ||
          untrack(() => options.instant?.() ?? false) ||
          typeof requestAnimationFrame !== 'function'
        ) {
          setValue(to)
          return
        }
        let start: number | undefined
        const step = (now: number) => {
          start ??= now
          const time = Math.min(1, (now - start) / options.durationMs)
          // The last step lands on the target exactly, not a rounding off it.
          setValue(time < 1 ? from + (to - from) * options.easing(time) : to)
          frame = time < 1 ? requestAnimationFrame(step) : undefined
        }
        frame = requestAnimationFrame(step)
      },
      { defer: true },
    ),
  )
  onCleanup(stop)
  return value
}
