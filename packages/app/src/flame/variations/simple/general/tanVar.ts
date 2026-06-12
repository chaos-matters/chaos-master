import { vec2f } from 'typegpu/data'
import { cos, cosh, sin, sinh } from 'typegpu/std'
import { EPS } from '@/flame/constants'
import { simpleVariation } from '../types'

export const tanVar = simpleVariation(
  'tanVar',
  (pos, varInfo) => {
    'use gpu'
    const d = cos(2.0 * pos.x) + cosh(2.0 * pos.y)
    const tanden = 1.0 / (d + EPS.$)
    return vec2f(tanden * sin(2.0 * pos.x), tanden * sinh(2.0 * pos.y)).mul(
      varInfo.weight,
    )
  },
  'general',
)
