import { vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { EPS } from '@/flame/constants'
import { simpleVariation } from '../types'

export const spiralwingVar = simpleVariation(
  'spiralwingVar',
  (pos, varInfo) => {
    'use gpu'
    const c1 = pos.x * pos.x
    const c2 = pos.y * pos.y
    const d = 1.0 / (c1 + c2 + EPS.$)
    const s = sin(c2)
    return vec2f(d * cos(c1) * s, d * sin(c1) * s).mul(varInfo.weight)
  },
  'general',
)
