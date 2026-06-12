import { vec2f } from 'typegpu/data'
import { cos, dot, sin } from 'typegpu/std'
import { simpleVariation } from '../types'

export const swirlVar = simpleVariation(
  'swirlVar',
  (pos, varInfo) => {
    'use gpu'
    const r2 = dot(pos, pos)
    const s2 = sin(r2)
    const c2 = cos(r2)
    return vec2f(pos.x * s2 - pos.y * c2, pos.x * c2 + pos.y * s2).mul(
      varInfo.weight,
    )
  },
  'general',
)
