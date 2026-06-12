import { vec2f } from 'typegpu/data'
import { select } from 'typegpu/std'
import { simpleVariation } from '../types'

export const bentVar = simpleVariation(
  'bentVar',
  (pos, varInfo) => {
    'use gpu'
    const nx = select(pos.x, 2.0 * pos.x, pos.x < 0.0)
    const ny = select(pos.y, 0.5 * pos.y, pos.y < 0.0)
    return vec2f(nx, ny).mul(varInfo.weight)
  },
  'general',
)
