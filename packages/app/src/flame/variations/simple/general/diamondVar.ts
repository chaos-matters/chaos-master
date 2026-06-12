import { vec2f } from 'typegpu/data'
import { cos, sin, sqrt } from 'typegpu/std'
import { EPS } from '@/flame/constants'
import { simpleVariation } from '../types'

export const diamondVar = simpleVariation(
  'diamondVar',
  (pos, varInfo) => {
    'use gpu'
    const r = sqrt(pos.x * pos.x + pos.y * pos.y)
    const rinv = 1.0 / (r + EPS.$)
    return vec2f(pos.x * rinv * cos(r), pos.y * rinv * sin(r)).mul(
      varInfo.weight,
    )
  },
  'general',
)
