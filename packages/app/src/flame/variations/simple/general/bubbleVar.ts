import { vec2f } from 'typegpu/data'
import { simpleVariation } from '../types'

export const bubbleVar = simpleVariation(
  'bubbleVar',
  (pos, varInfo) => {
    'use gpu'

    const r = (pos.x * pos.x + pos.y * pos.y) * 0.25 + 1.0
    const t = varInfo.weight / r

    const newX = t * pos.x
    const newY = t * pos.y

    return vec2f(newX, newY)
  },
  'general',
)
