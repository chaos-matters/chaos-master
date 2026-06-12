import { vec2f } from 'typegpu/data'
import { cos, cosh, sin, sinh } from 'typegpu/std'
import { simpleVariation } from '../types'

export const sinVar = simpleVariation(
  'sinVar',
  (pos, varInfo) => {
    'use gpu'
    return vec2f(sin(pos.x) * cosh(pos.y), cos(pos.x) * sinh(pos.y)).mul(
      varInfo.weight,
    )
  },
  'general',
)
