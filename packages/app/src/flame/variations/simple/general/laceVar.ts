import { vec2f } from 'typegpu/data'
import { atan2, cos, select, sin, sqrt } from 'typegpu/std'
import { random } from '@/shaders/random'
import { simpleVariation } from '../types'

export const laceVar = simpleVariation(
  'laceVar',
  (pos, varInfo) => {
    'use gpu'

    const r0 = sqrt(pos.x * pos.x + pos.y * pos.y)
    const weight = random()
    const r = 2.0

    const w1 = atan2(pos.y, pos.x - 1.0)
    const x1 = (-r0 * sin(w1)) / r
    const y1 = (-r0 * cos(w1)) / r + 1.0

    const w2 = atan2(pos.y - sqrt(3.0) / 2.0, pos.x + 0.5)
    const x2 = (-r0 * sin(w2)) / r - 0.5
    const y2 = (-r0 * cos(w2)) / r + sqrt(3.0) / 2.0

    const w3 = atan2(pos.y + sqrt(3.0) / 2.0, pos.x + 0.5)
    const x3 = (-r0 * sin(w3)) / r - 0.5
    const y3 = (-r0 * cos(w3)) / r - sqrt(3.0) / 2.0

    const isBranch1 = weight > 0.75
    const isBranch2 = weight > 0.5

    const finalX = select(select(x3, x2, isBranch2), x1, isBranch1)
    const finalY = select(select(y3, y2, isBranch2), y1, isBranch1)

    const newX = varInfo.weight * finalX
    const newY = varInfo.weight * finalY

    return vec2f(newX, newY)
  },
  'general',
)
