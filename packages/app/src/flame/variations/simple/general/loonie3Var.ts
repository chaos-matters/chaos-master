import { vec2f } from 'typegpu/data'
import { select, sqrt } from 'typegpu/std'
import { EPS } from '@/flame/constants'
import { simpleVariation } from '../types'

export const loonie3Var = simpleVariation(
  'loonie3Var',
  (pos, varInfo) => {
    'use gpu'
    const w = select(varInfo.weight, EPS.$, varInfo.weight === 0.0)
    const sqrW = w * w
    const r2Default = 2.0 * sqrW
    const d = pos.x * pos.x + pos.y * pos.y
    const r2Computed = (d * d) / (pos.x * pos.x + EPS.$)
    const r2 = select(r2Default, r2Computed, pos.x > EPS.$)
    const small = r2 < sqrW
    const sqrtArg = sqrW / r2 - 1.0
    const safeArg = select(sqrtArg, 0.0, sqrtArg < 0.0)
    const rr = w * sqrt(safeArg)
    const newX = select(w * pos.x, rr * pos.x, small)
    const newY = select(w * pos.y, rr * pos.y, small)
    return vec2f(newX, newY)
  },
  'general',
)
