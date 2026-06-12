import { vec2f } from 'typegpu/data'
import { select } from 'typegpu/std'
import { random } from '@/shaders/random'
import { simpleVariation } from '../types'

export const threePointIFSVar = simpleVariation(
  'threePointIFSVar',
  (pos, varInfo) => {
    'use gpu'
    const r = random()
    // Branch probabilities: 1/3, 4/9, 2/9
    // Thresholds: 1/3 and 7/9
    const bx1 = pos.x / 2.0 - pos.y / 2.0 + 0.5
    const by1 = -pos.x / 2.0 - pos.y / 2.0 + 0.5
    const x = select(
      select(bx1, pos.y, r < 7.0 / 9.0),
      -pos.y / 2.0 + 0.5,
      r < 1.0 / 3.0,
    )
    const y = select(
      select(by1, pos.x, r < 7.0 / 9.0),
      -pos.x / 2.0 + 0.5,
      r < 1.0 / 3.0,
    )
    return vec2f(x, y).mul(varInfo.weight)
  },
  'general',
)
