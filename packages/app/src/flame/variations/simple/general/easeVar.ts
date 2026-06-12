import { vec2f } from 'typegpu/data'
import { simpleVariation } from '../types'

// Easing function warp: applies smoothstep-like easing to both coordinates
export const easeVar = simpleVariation(
  'easeVar',
  (pos, varInfo) => {
    'use gpu'
    const t = varInfo.weight
    const x = pos.x * 0.5 + 0.5
    const y = pos.y * 0.5 + 0.5
    const easeX = x * x * (3.0 - 2.0 * x)
    const easeY = y * y * (3.0 - 2.0 * y)
    return vec2f(pos.x + (easeX - x) * t * 2.0, pos.y + (easeY - y) * t * 2.0)
  },
  'general',
)
