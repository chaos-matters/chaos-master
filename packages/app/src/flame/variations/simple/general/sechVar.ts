import { vec2f } from 'typegpu/data'
import { cos, cosh, sin, sinh } from 'typegpu/std'
import { EPS } from '@/flame/constants'
import { simpleVariation } from '../types'

export const sechVar = simpleVariation(
  'sechVar',
  (pos, varInfo) => {
    'use gpu'
    const d = cos(2.0 * pos.y) + cosh(2.0 * pos.x)
    const sechden = 2.0 / (d + EPS.$)
    return vec2f(
      sechden * cos(pos.y) * cosh(pos.x),
      -sechden * sin(pos.y) * sinh(pos.x),
    ).mul(varInfo.weight)
  },
  'general',
)
