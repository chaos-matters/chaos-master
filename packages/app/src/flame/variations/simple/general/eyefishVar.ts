import { length } from 'typegpu/std'
import { simpleVariation } from '../types'

export const eyefishVar = simpleVariation(
  'eyefishVar',
  (pos, varInfo) => {
    'use gpu'
    const factor = 2.0 / (length(pos) + 1.0)
    return pos.mul(factor).mul(varInfo.weight)
  },
  'general',
)
