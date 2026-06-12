import { vec2f } from 'typegpu/data'
import { atan2, cos, length, pow, sin } from 'typegpu/std'
import { simpleVariation } from '../types'

export const powerVar = simpleVariation(
  'powerVar',
  (pos, varInfo) => {
    'use gpu'
    const r = length(pos)
    const theta = atan2(pos.y, pos.x)
    const sinTheta = sin(theta)
    const factor = pow(r, sinTheta)
    return vec2f(cos(theta), sinTheta).mul(factor).mul(varInfo.weight)
  },
  'general',
)
