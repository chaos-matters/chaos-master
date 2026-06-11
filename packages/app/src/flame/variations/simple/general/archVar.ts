import { vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { random } from '@/shaders/random'
import { PI } from '../../../constants'
import { simpleVariation } from '../types'

export const archVar = simpleVariation(
  'archVar',
  (pos, varInfo) => {
    'use gpu'
    const ang = random() * varInfo.weight * PI.$
    const s = sin(ang)
    const c = cos(ang)
    if (c === 0.0) {
      return vec2f(pos.x, pos.y)
    }
    return vec2f(s, (s * s) / c)
  },
  'general',
)
