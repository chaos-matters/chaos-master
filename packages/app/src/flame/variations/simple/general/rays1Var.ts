import { vec2f } from 'typegpu/data'
import { dot, sqrt, tan } from 'typegpu/std'
import { EPS, PI } from '../../../constants'
import { simpleVariation } from '../types'

export const rays1Var = simpleVariation(
  'rays1Var',
  (pos, varInfo) => {
    'use gpu'
    const w = varInfo.weight
    const t = dot(pos, pos) + EPS.$
    const m2pi2 = 4.0 / (PI.$ * PI.$)
    const u = 1.0 / tan(sqrt(t)) + w * m2pi2
    return vec2f((u * t) / (pos.x + EPS.$), (u * t) / (pos.y + EPS.$))
  },
  'general',
)
