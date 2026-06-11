import { vec2f } from 'typegpu/data'
import { atan2, length } from 'typegpu/std'
import { PI } from '@/flame/constants'
import { simpleVariation } from '../types'

export const polarVar = simpleVariation(
  'polarVar',
  (pos, varInfo) => {
    'use gpu'
    const r = length(pos)
    const theta = atan2(pos.y, pos.x)
    return vec2f(theta / PI.$, r - 1.0).mul(varInfo.weight)
  },
  'general',
)
