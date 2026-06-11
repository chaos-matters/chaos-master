import { vec2f } from 'typegpu/data'
import { length } from 'typegpu/std'
import { EPS } from '@/flame/constants'
import { simpleVariation } from '../types'

export const horseshoeVar = simpleVariation(
  'horseshoeVar',
  (pos, varInfo) => {
    'use gpu'
    const r = length(pos) + EPS.$
    return vec2f((pos.x - pos.y) * (pos.x + pos.y), 2.0 * pos.x * pos.y)
      .div(r)
      .mul(varInfo.weight)
  },
  'general',
)
