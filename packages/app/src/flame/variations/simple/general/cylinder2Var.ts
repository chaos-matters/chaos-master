import { vec2f } from 'typegpu/data'
import { sqrt } from 'typegpu/std'
import { simpleVariation } from '../types'

export const cylinder2Var = simpleVariation(
  'cylinder2Var',
  (pos, varInfo) => {
    'use gpu'
    return vec2f(pos.x / sqrt(pos.x * pos.x + 1.0), pos.y).mul(varInfo.weight)
  },
  'general',
)
