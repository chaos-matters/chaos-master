import { vec2f } from 'typegpu/data'
import { EPS, PI } from '@/flame/constants'
import { simpleVariation } from '../types'

const M_2_PI_SQ = 4.0 / (PI.$ * PI.$)

export const roundSpherVar = simpleVariation(
  'roundSpherVar',
  (pos, varInfo) => {
    'use gpu'
    const d = pos.x * pos.x + pos.y * pos.y + EPS.$
    const e = 1.0 / d + M_2_PI_SQ
    const scale = varInfo.weight / (d * e)
    return vec2f(pos.x * scale, pos.y * scale)
  },
  'general',
)
