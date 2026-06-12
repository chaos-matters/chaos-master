import { vec2f } from 'typegpu/data'
import { atan2, cos, length, select, sin } from 'typegpu/std'
import { PI } from '@/flame/constants'
import { simpleVariation } from '../types'

export const fanVar = simpleVariation(
  'fanVar',
  (pos, varInfo) => {
    'use gpu'
    const T = varInfo.affineCoefs
    const t = PI.$ * T.c * T.c
    const r = length(pos)
    const theta = atan2(pos.y, pos.x)
    const thalf = t / 2.0
    const modCond = (theta + T.f) % t
    const angle = select(theta + thalf, theta - thalf, modCond > thalf)
    return vec2f(cos(angle), sin(angle)).mul(r).mul(varInfo.weight)
  },
  'general',
)
