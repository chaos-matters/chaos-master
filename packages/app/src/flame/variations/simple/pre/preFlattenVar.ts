import { vec2f } from 'typegpu/data'
import { simpleVariation } from '../types'

// Pre-flatten: compresses before main transform for different inter-variation interaction
export const preFlattenVar = simpleVariation(
  'preFlattenVar',
  (pos, varInfo) => {
    'use gpu'
    const t = varInfo.weight
    const y = pos.y / (1.0 + t * 2.0)
    return vec2f(pos.x, y)
  },
  'pre',
)
