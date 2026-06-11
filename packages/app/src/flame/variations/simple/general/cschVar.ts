import { vec2f } from 'typegpu/data'
import { cos, cosh, select, sin, sinh } from 'typegpu/std'
import { simpleVariation } from '../types'

export const cschVar = simpleVariation(
  'cschVar',
  (pos, varInfo) => {
    'use gpu'

    const cschsin = sin(pos.y)
    const cschcos = cos(pos.y)
    const cschsinh = sinh(pos.x)
    const cschcosh = cosh(pos.x)

    const d = cosh(2.0 * pos.x) - cos(2.0 * pos.y)

    const cschden = 2.0 / select(d, 1.0e-9, d === 0.0)

    const valX = cschden * cschsinh * cschcos
    const valY = -(cschden * cschcosh * cschsin)

    const newX = varInfo.weight * valX
    const newY = varInfo.weight * valY

    return vec2f(newX, newY)
  },
  'general',
)
