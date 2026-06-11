import { vec2f } from 'typegpu/data'
import { cos, exp, sin } from 'typegpu/std'
import { PI } from '@/flame/constants'
import { simpleVariation } from '../types'

export const exponentialVar = simpleVariation(
  'exponentialVar',
  (pos, varInfo) => {
    'use gpu'
    const d = exp(pos.x - 1.0)
    const r = PI.$ * pos.y
    return vec2f(d * cos(r), d * sin(r)).mul(varInfo.weight)
  },
  'general',
)
