import { vec2f } from 'typegpu/data'
import { atan2, log } from 'typegpu/std'
import { EPS } from '../../../constants'
import { simpleVariation } from '../types'

export const logVar = simpleVariation(
  'logVar',
  (pos, varInfo) => {
    'use gpu'
    const r2 = pos.x * pos.x + pos.y * pos.y + EPS.$
    return vec2f(0.5 * log(r2), atan2(pos.y, pos.x)).mul(varInfo.weight)
  },
  'general',
)
