import { vec2f } from 'typegpu/data'
import { abs, cos, cosh, select, sin, sinh } from 'typegpu/std'
import { EPS } from '../../../constants'
import { simpleVariation } from '../types'

export const cscVar = simpleVariation(
  'cscVar',
  (pos, varInfo) => {
    'use gpu'
    const d = cosh(2.0 * pos.y) - cos(2.0 * pos.x)
    const safeD = select(d, EPS.$, abs(d) < EPS.$)
    const cscden = 2.0 / safeD
    return vec2f(
      cscden * sin(pos.x) * cosh(pos.y),
      -cscden * cos(pos.x) * sinh(pos.y),
    ).mul(varInfo.weight)
  },
  'general',
)
