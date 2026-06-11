import { f32, vec2f } from 'typegpu/data'
import { select } from 'typegpu/std'
import { simpleVariation } from '../types'

export const flipYVar = simpleVariation(
  'flipYVar',
  (pos, varInfo) => {
    'use gpu'
    const sign = select(f32(-1.0), f32(1.0), pos.x <= 0.0)
    return vec2f(pos.x, sign * pos.y).mul(varInfo.weight)
  },
  'general',
)
