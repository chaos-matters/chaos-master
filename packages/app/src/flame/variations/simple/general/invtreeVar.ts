import { vec2f } from 'typegpu/data'
import { select } from 'typegpu/std'
import { random } from '@/shaders/random'
import { simpleVariation } from '../types'

export const invtreeVar = simpleVariation(
  'invtreeVar',
  (pos, varInfo) => {
    'use gpu'
    const r = random()
    const x = select(
      select(pos.x / (pos.x + 1.0), 1.0 / (pos.x + 1.0), r < 0.666),
      pos.x / 2.0,
      r < 0.333,
    )
    const y = select(
      select(1.0 / (pos.y + 1.0), pos.y / (pos.y + 1.0), r < 0.666),
      pos.y / 2.0,
      r < 0.333,
    )
    return vec2f(x, y).mul(varInfo.weight)
  },
  'general',
)
