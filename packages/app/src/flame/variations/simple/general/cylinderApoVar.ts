import { vec2f } from 'typegpu/data'
import { sin } from 'typegpu/std'
import { simpleVariation } from '../types'

export const cylinderApoVar = simpleVariation(
  'cylinderApoVar',
  (pos, varInfo) => {
    'use gpu'
    return vec2f(sin(pos.x), pos.y).mul(varInfo.weight)
  },
  'general',
)
