import { f32, vec2f } from 'typegpu/data'
import { atan2, cos, length, select, sin, sqrt } from 'typegpu/std'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { simpleVariation } from '../types'

export const juliaVar = simpleVariation(
  'juliaVar',
  (pos, varInfo) => {
    'use gpu'
    const r = length(pos)
    const theta = atan2(pos.y, pos.x)
    const omega = f32(select(0.0, PI.$, random() > 0.5))
    const angle = theta / 2.0 + omega
    return vec2f(cos(angle), sin(angle)).mul(sqrt(r)).mul(varInfo.weight)
  },
  'general',
)
