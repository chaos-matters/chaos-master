import { vec2f } from 'typegpu/data'
import { cos, cosh, sin, sinh } from 'typegpu/std'
import { simpleVariation } from '../types'

export const cothVar = simpleVariation(
  'cothVar',
  (pos, varInfo) => {
    'use gpu'
    const cothsin = sin(2.0 * pos.y)
    const cothcos = cos(2.0 * pos.y)
    const cothsinh = sinh(2.0 * pos.x)
    const cothcosh = cosh(2.0 * pos.x)
    const d = cothcosh - cothcos
    if (d === 0.0) {
      return vec2f(0.0, 0.0)
    }
    const cothden = 1.0 / d
    const newX = varInfo.weight * cothden * cothsinh
    const newY = varInfo.weight * cothden * cothsin
    return vec2f(newX, newY)
  },
  'general',
)
