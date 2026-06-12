import { vec2f } from 'typegpu/data'
import { atan2, cos, sin, sqrt } from 'typegpu/std'
import { simpleVariation } from '../types'

export const preDisc = simpleVariation(
  'preDiscVar',
  (pos, varInfo) => {
    'use gpu'
    const at = atan2(pos.y, pos.x)
    const sr = sqrt(sqrt(pos.x * pos.x + pos.y * pos.y))
    const s = varInfo.weight * at * 0.3183098861837907
    const a = 3.141592653589793 * sr
    return vec2f(s * sin(a), s * cos(a))
  },
  'pre',
)
