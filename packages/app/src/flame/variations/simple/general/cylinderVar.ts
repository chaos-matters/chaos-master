import { vec2f } from 'typegpu/data'
import { sin } from 'typegpu/std'
import { simpleVariation } from '../types'

export const cylinderVar = simpleVariation(
  'cylinderVar',
  (pos, varInfo) => {
    'use gpu'
    return vec2f(sin(pos.x), pos.y).mul(varInfo.weight)
  },
  'general',
)
