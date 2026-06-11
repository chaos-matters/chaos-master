import { vec2f } from 'typegpu/data'
import { simpleVariation } from '../types'

// Flatten: compresses vertical range toward center for lens-flare compression
export const postFlattenVar = simpleVariation(
  'postFlattenVar',
  (pos, varInfo) => {
    'use gpu'
    const t = varInfo.weight
    const y = pos.y / (1.0 + t * 2.0)
    return vec2f(pos.x, y)
  },
  'post',
)
