import { vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { PI } from '../../../constants'
import { simpleVariation } from '../types'

export const invpolarVar = simpleVariation(
  'invpolarVar',
  (pos, varInfo) => {
    'use gpu'
    const ny = 1.0 + pos.y
    return vec2f(ny * sin(pos.x * PI.$), ny * cos(pos.x * PI.$)).mul(
      varInfo.weight,
    )
  },
  'general',
)
