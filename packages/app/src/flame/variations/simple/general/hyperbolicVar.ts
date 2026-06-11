import { vec2f } from 'typegpu/data'
import { atan2, cos, length, sin } from 'typegpu/std'
import { EPS } from '@/flame/constants'
import { simpleVariation } from '../types'

export const hyperbolicVar = simpleVariation(
  'hyperbolicVar',
  (pos, varInfo) => {
    'use gpu'
    const r = length(pos) + EPS.$
    const theta = atan2(pos.y, pos.x)
    return vec2f(sin(theta) / r, r * cos(theta)).mul(varInfo.weight)
  },
  'general',
)
