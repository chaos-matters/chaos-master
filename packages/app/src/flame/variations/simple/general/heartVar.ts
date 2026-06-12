import { vec2f } from 'typegpu/data'
import { atan2, cos, length, sin } from 'typegpu/std'
import { simpleVariation } from '../types'

export const heartVar = simpleVariation(
  'heartVar',
  (pos, varInfo) => {
    'use gpu'
    const r = length(pos)
    const theta = atan2(pos.y, pos.x)
    return vec2f(sin(theta * r), -cos(theta * r))
      .mul(r)
      .mul(varInfo.weight)
  },
  'general',
)
