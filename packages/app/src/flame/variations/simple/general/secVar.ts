import { vec2f } from 'typegpu/data'
import { abs, cos, cosh, select, sin, sinh } from 'typegpu/std'
import { EPS } from '../../../constants'
import { simpleVariation } from '../types'

export const secVar = simpleVariation(
  'secVar',
  (pos, varInfo) => {
    'use gpu'
    const d = cos(2.0 * pos.x) + cosh(2.0 * pos.y)
    const safeD = select(d, EPS.$, abs(d) < EPS.$)
    const secden = 2.0 / safeD
    return vec2f(
      secden * cos(pos.x) * cosh(pos.y),
      secden * sin(pos.x) * sinh(pos.y),
    ).mul(varInfo.weight)
  },
  'general',
)
