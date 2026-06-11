import { vec2f } from 'typegpu/data'
import { simpleVariation } from '../types'

export const linearVar = simpleVariation(
  'linearVar',
  (pos, varInfo) => {
    'use gpu'
    return vec2f(pos).mul(varInfo.weight)
  },
  'general',
)
