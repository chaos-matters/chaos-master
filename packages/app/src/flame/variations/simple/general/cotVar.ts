import { vec2f } from 'typegpu/data'
import { cos, cosh, sin, sinh } from 'typegpu/std'
import { safeDenom } from '../../safeMath'
import { simpleVariation } from '../types'

export const cotVar = simpleVariation(
  'cotVar',
  (pos, varInfo) => {
    'use gpu'
    const cotsin = sin(2.0 * pos.x)
    const cotcos = cos(2.0 * pos.x)
    const cotsinh = sinh(2.0 * pos.y)
    const cotcosh = cosh(2.0 * pos.y)
    const denom = cotcosh - cotcos
    const cotden = 1.0 / safeDenom(denom)
    return vec2f(cotden * cotsin, -cotden * cotsinh).mul(varInfo.weight)
  },
  'general',
)
