import { vec2f } from 'typegpu/data'
import { simpleVariation } from '../types'

export const ennepersVar = simpleVariation(
  'ennepersVar',
  (pos, varInfo) => {
    'use gpu'
    const x = pos.x
    const y = pos.y
    const x2 = x * x
    return vec2f(
      x - (x * x2) / 3.0 + x2 * y,
      y - (y * y * y) / 3.0 + y * x2,
    ).mul(varInfo.weight)
  },
  'general',
)
