import { vec2f } from 'typegpu/data'
import { cos, dot, sin, sqrt, tan } from 'typegpu/std'
import { EPS } from '../../../constants'
import { simpleVariation } from '../types'

export const rays3Var = simpleVariation(
  'rays3Var',
  (pos, varInfo) => {
    'use gpu'
    const t = dot(pos, pos) + EPS.$
    const t2 = t * t
    const inner = cos(sin(t2) * sin(1.0 / t2))
    const u = 1.0 / sqrt(inner)
    const factor = u * t * 0.1
    return vec2f(
      (factor * cos(t)) / (pos.x + EPS.$),
      (factor * tan(t)) / (pos.y + EPS.$),
    ).mul(varInfo.weight)
  },
  'general',
)
