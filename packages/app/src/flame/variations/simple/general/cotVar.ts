import { vec2f } from 'typegpu/data'
import { abs, cos, cosh, select, sin, sinh } from 'typegpu/std'
import { EPS } from '../../../constants'
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
    const safeDenom = select(denom, EPS.$, abs(denom) < EPS.$)
    const cotden = 1.0 / safeDenom
    return vec2f(cotden * cotsin, -cotden * cotsinh).mul(varInfo.weight)
  },
  'general',
)
