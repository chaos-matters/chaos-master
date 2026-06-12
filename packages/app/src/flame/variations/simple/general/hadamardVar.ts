import { vec2f } from 'typegpu/data'
import { select } from 'typegpu/std'
import { random } from '@/shaders/random'
import { simpleVariation } from '../types'

export const hadamardVar = simpleVariation(
  'hadamardVar',
  (pos, varInfo) => {
    'use gpu'
    const r = random()
    // Branch probabilities: 1/3, 4/9 (~0.444), 2/9 (~0.222)
    // Thresholds: 1/3 and 7/9
    const x = select(
      select(-pos.y / 2.0 - 0.5, pos.y / 2.0, r < 7.0 / 9.0),
      pos.x / 2.0,
      r < 1.0 / 3.0,
    )
    const y = select(
      select(pos.x / 2.0, -pos.x / 2.0 - 0.5, r < 7.0 / 9.0),
      pos.y / 2.0,
      r < 1.0 / 3.0,
    )
    return vec2f(x, y).mul(varInfo.weight)
  },
  'general',
)
