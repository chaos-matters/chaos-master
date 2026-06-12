import { vec2f } from 'typegpu/data'
import { clamp, sin, tan } from 'typegpu/std'
import { simpleVariation } from '../types'

export const popcornVar = simpleVariation(
  'popcornVar',
  (pos, varInfo) => {
    'use gpu'
    const T = varInfo.affineCoefs
    const tx = clamp(tan(3.0 * pos.x), -1e8, 1e8)
    const ty = clamp(tan(3.0 * pos.y), -1e8, 1e8)
    const delta = vec2f(T.c * sin(ty), T.f * sin(tx))
    return pos.add(delta).mul(varInfo.weight)
  },
  'general',
)
