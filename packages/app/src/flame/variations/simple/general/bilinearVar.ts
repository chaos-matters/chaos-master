import { vec2f } from 'typegpu/data'
import { simpleVariation } from '../types'

export const bilinearVar = simpleVariation(
  'bilinearVar',
  (pos, varInfo) => {
    'use gpu'

    const newX = varInfo.weight * pos.y
    const newY = varInfo.weight * pos.x

    return vec2f(newX, newY)
  },
  'general',
)
