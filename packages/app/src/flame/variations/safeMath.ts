import { tgpu } from 'typegpu'
import { f32 } from 'typegpu/data'
import { select } from 'typegpu/std'
import { EPS_SMALL } from '../constants'

/**
 * Divide-by-zero guard shared across variations (notably the trig/hyperbolic
 * "q" family): returns `v` unchanged unless it is exactly zero, in which case it
 * returns the `EPS_SMALL` (1e-9) epsilon so a subsequent division stays finite.
 *
 * This is the canonical form of the `select(v, 1e-9, v === 0.0)` expression that
 * was hand-inlined across ~20 variation files. Sites that deliberately use a
 * different tier (`EPS`, `EPS_TINY`) keep that tier.
 */
export const safeDenom = tgpu.fn(
  [f32],
  f32,
)((v) => {
  'use gpu'
  return select(v, EPS_SMALL.$, v === 0.0)
})
