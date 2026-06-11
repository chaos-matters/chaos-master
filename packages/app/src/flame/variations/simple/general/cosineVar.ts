import { vec2f } from 'typegpu/data'
import { cos, cosh, sin, sinh } from 'typegpu/std'
import { PI } from '@/flame/constants'
import { simpleVariation } from '../types'

export const cosineVar = simpleVariation(
  'cosineVar',
  (pos, varInfo) => {
    'use gpu'
    const r = pos.x * PI.$
    return vec2f(cos(r) * cosh(pos.y), -sin(r) * sinh(pos.y)).mul(
      varInfo.weight,
    )
  },
  'general',
)
