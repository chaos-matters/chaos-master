import { vec2f } from 'typegpu/data'
import { abs, select } from 'typegpu/std'
import { random } from '@/shaders/random'
import { simpleVariation } from '../types'

// Space rift: creates a tear/rift in the coordinate space with random offset
export const riftVar = simpleVariation(
  'riftVar',
  (pos, varInfo) => {
    'use gpu'
    const t = varInfo.weight
    const dist = abs(pos.x) + abs(pos.y)
    const threshold = 0.3
    const inRift = dist < threshold
    const shiftX = (random() - 0.5) * 2.0 * t
    const shiftY = (random() - 0.5) * 2.0 * t
    return vec2f(
      select(pos.x, pos.x + shiftX, inRift),
      select(pos.y, pos.y + shiftY, inRift),
    )
  },
  'general',
)
