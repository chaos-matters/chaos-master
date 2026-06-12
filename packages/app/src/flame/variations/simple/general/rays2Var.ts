import { vec2f } from 'typegpu/data'
import { cos, dot, tan } from 'typegpu/std'
import { EPS } from '../../../constants'
import { simpleVariation } from '../types'

export const rays2Var = simpleVariation(
  'rays2Var',
  (pos, varInfo) => {
    'use gpu'
    const t = dot(pos, pos) + EPS.$
    const inner = t * tan(1.0 / t)
    const u = 1.0 / cos(inner)
    const factor = u * t * 0.1
    return vec2f(factor / (pos.x + EPS.$), factor / (pos.y + EPS.$)).mul(
      varInfo.weight,
    )
  },
  'general',
)
