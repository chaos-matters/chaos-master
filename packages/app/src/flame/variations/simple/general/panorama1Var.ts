import { vec2f } from 'typegpu/data'
import { atan2, sqrt } from 'typegpu/std'
import { PI } from '../../../constants'
import { simpleVariation } from '../types'

export const panorama1Var = simpleVariation(
  'panorama1Var',
  (pos, varInfo) => {
    'use gpu'
    const M_1_PI = 1.0 / PI.$
    const aux = 1.0 / sqrt(pos.x * pos.x + pos.y * pos.y + 1.0)
    const x1 = pos.x * aux
    const y1 = pos.y * aux
    const naux = sqrt(x1 * x1 + y1 * y1)
    return vec2f(atan2(x1, y1) * M_1_PI, naux - 0.5).mul(varInfo.weight)
  },
  'general',
)
