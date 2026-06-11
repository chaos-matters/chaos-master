import { vec2f } from 'typegpu/data'
import { atan2, log } from 'typegpu/std'
import { EPS, PI } from '@/flame/constants'
import { simpleVariation } from '../types'

export const polar2Var = simpleVariation(
  'polar2Var',
  (pos, varInfo) => {
    'use gpu'
    const r2 = pos.x * pos.x + pos.y * pos.y + EPS.$
    const p2v = 1.0 / PI.$
    return vec2f(p2v * atan2(pos.y, pos.x), (p2v / 2.0) * log(r2)).mul(
      varInfo.weight,
    )
  },
  'general',
)
