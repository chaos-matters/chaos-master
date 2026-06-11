import { vec2f } from 'typegpu/data'
import { atan2, cos, sin, sqrt } from 'typegpu/std'
import { PI } from '@/flame/constants'
import { simpleVariation } from '../types'

export const discVar = simpleVariation(
  'discVar',
  (pos, varInfo) => {
    'use gpu'
    const r = sqrt(pos.x * pos.x + pos.y * pos.y)
    const t = atan2(pos.y, pos.x) / PI.$
    return vec2f(t * sin(PI.$ * r), t * cos(PI.$ * r)).mul(varInfo.weight)
  },
  'general',
)
