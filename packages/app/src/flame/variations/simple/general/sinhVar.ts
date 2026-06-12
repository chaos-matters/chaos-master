import { vec2f } from 'typegpu/data'
import { cos, cosh, sin, sinh } from 'typegpu/std'
import { simpleVariation } from '../types'

export const sinhVar = simpleVariation(
  'sinhVar',
  (pos, varInfo) => {
    'use gpu'
    return vec2f(sinh(pos.x) * cos(pos.y), cosh(pos.x) * sin(pos.y)).mul(
      varInfo.weight,
    )
  },
  'general',
)
