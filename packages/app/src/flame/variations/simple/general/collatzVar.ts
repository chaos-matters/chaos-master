import { f32, vec2f } from 'typegpu/data'
import { abs, cos, floor, select, sin } from 'typegpu/std'
import { simpleVariation } from '../types'

export const collatzVar = simpleVariation(
  'collatzVar',
  (pos, varInfo) => {
    'use gpu'
    let n = f32(floor(abs(pos.x) * 100.0 + abs(pos.y) * 100.0)) + 1.0
    let steps = f32(0.0)
    for (let i = 0; i < 64; i++) {
      const isEven = n % 2.0 < 0.5
      n = select(3.0 * n + 1.0, n / 2.0, isEven)
      steps += f32(select(0.0, 1.0, n > 1.0))
    }
    const t = steps / 64.0
    const a = t * 6.283185307
    const r = t * varInfo.weight
    return vec2f(pos.x + r * cos(a), pos.y + r * sin(a))
  },
  'general',
)
