import { vec2f } from 'typegpu/data'
import { cos, sin, sqrt } from 'typegpu/std'
import { PI } from '../../../constants'
import { simpleVariation } from '../types'

// Tornado swirl: vertical vortex with height-dependent rotation speed
export const tornadoVar = simpleVariation(
  'tornadoVar',
  (pos, varInfo) => {
    'use gpu'
    const t = varInfo.weight
    const r = sqrt(pos.x * pos.x + pos.y * pos.y)
    const a = (1.0 - r) * PI.$ * 3.0 * t
    const c = cos(a)
    const s = sin(a)
    return vec2f(pos.x * c - pos.y * s, pos.x * s + pos.y * c + t * r * 0.1)
  },
  'general',
)
