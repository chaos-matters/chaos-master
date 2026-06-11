import { f32, vec2f } from 'typegpu/data'
import { select } from 'typegpu/std'
import { simpleVariation } from '../types'

export const flipCircleVar = simpleVariation(
  'flipCircleVar',
  (pos, varInfo) => {
    'use gpu'
    const r2 = pos.x * pos.x + pos.y * pos.y
    const w2 = varInfo.weight * varInfo.weight
    const signY = select(f32(1.0), f32(-1.0), r2 <= w2)
    return vec2f(pos.x, signY * pos.y)
  },
  'general',
)
