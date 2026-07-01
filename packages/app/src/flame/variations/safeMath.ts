import { tgpu } from 'typegpu'
import { f32 } from 'typegpu/data'
import { select } from 'typegpu/std'

/**
 * Divide-by-zero guard shared across variations (notably the trig/hyperbolic
 * "q" family): returns `v` unchanged unless it is exactly zero, in which case it
 * returns a tiny non-zero epsilon so a subsequent division stays finite.
 *
 * This is the canonical form of the `select(v, 1e-9, v === 0.0)` expression that
 * was hand-inlined across ~20 variation files with the same 1e-9 epsilon.
 * Sites that deliberately use a different epsilon (e.g. `1.0e-10`, or the shared
 * `EPS`/`EPS_TINY` constants) are intentionally left as-is.
 */
export const safeDenom = tgpu.fn(
  [f32],
  f32,
)((v) => {
  'use gpu'
  return select(v, 1e-9, v === 0.0)
})
