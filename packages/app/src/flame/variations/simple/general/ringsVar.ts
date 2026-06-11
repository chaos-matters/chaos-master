import { vec2f } from 'typegpu/data'
import { atan2, cos, sin, sqrt } from 'typegpu/std'
import { EPS } from '@/flame/constants'
import { simpleVariation } from '../types'

export const ringsVar = simpleVariation(
  'ringsVar',
  (pos, varInfo) => {
    'use gpu'
    const T = varInfo.affineCoefs
    const c2 = T.c * T.c + EPS.$
    const r = sqrt(pos.x * pos.x + pos.y * pos.y + EPS.$)
    const theta = atan2(pos.y, pos.x)
    const factor = ((r + c2) % (2.0 * c2)) - c2 + r * (1.0 - c2)
    return vec2f(cos(theta), sin(theta)).mul(factor).mul(varInfo.weight)
  },
  'general',
)
