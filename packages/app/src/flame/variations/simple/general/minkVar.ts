import { vec2f } from 'typegpu/data'
import { abs, floor, select } from 'typegpu/std'
import { simpleVariation } from '../types'

// Minkowski sausage / curve folding
export const minkVar = simpleVariation(
  'minkVar',
  (pos, varInfo) => {
    'use gpu'
    let x = pos.x
    let y = pos.y / 4.0
    for (let i = 0; i < 5; i++) {
      const qx = floor(x)
      const qy = floor(y)
      let fx = x - qx
      let fy = y - qy
      const shouldSwap = abs(qx) % 2.0 > 0.5
      fx = select(fx, 1.0 - fx, shouldSwap)
      fy = select(fy, 1.0 - fy, shouldSwap)
      x = fx * 2.0
      y = fy * 2.0
    }
    return vec2f(
      (x - 1.0) * varInfo.weight + pos.x,
      (y - 1.0) * varInfo.weight + pos.y,
    )
  },
  'general',
)
