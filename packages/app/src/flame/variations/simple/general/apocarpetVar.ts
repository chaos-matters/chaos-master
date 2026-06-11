import { f32, vec2f } from 'typegpu/data'
import { floor, sqrt } from 'typegpu/std'
import { random } from '@/shaders/random'
import { simpleVariation } from '../types'

export const apocarpetVar = simpleVariation(
  'apocarpetVar',
  (pos, varInfo) => {
    'use gpu'

    let x = pos.x
    let y = pos.y
    const r = 1.0 / (1.0 + sqrt(2.0))
    const denom = pos.x * pos.x + pos.y * pos.y + 1.0e-10
    const branch = f32(floor(6.0 * random()))

    if (branch === 0.0) {
      x = (2.0 * pos.x * pos.y) / denom
      y = (pos.x * pos.x - pos.y * pos.y) / denom
    } else if (branch === 1.0) {
      x = pos.x * r - r
      y = pos.y * r - r
    } else if (branch === 2.0) {
      x = pos.x * r + r
      y = pos.y * r + r
    } else if (branch === 3.0) {
      x = pos.x * r + r
      y = pos.y * r - r
    } else if (branch === 4.0) {
      x = pos.x * r - r
      y = pos.y * r + r
    } else {
      x = pos.x * r
      y = pos.y * r
    }

    return vec2f(x * varInfo.weight, y * varInfo.weight)
  },
  'general',
)
