import { vec2f } from 'typegpu/data'
import { EPS, PI } from '@/flame/constants'
import { simpleVariation } from '../types'

export const rondspherVar = simpleVariation(
  'rondspherVar',
  (pos, varInfo) => {
    'use gpu'
    const d = pos.x * pos.x + pos.y * pos.y + EPS.$
    const M_2_PI = 2.0 / PI.$
    const e = 1.0 / d + M_2_PI * M_2_PI
    return vec2f(
      (varInfo.weight * pos.x) / (d * e),
      (varInfo.weight * pos.y) / (d * e),
    )
  },
  'general',
)
