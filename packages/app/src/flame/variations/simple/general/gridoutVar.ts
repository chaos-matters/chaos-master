import { vec2f } from 'typegpu/data'
import { round } from 'typegpu/std'
import { simpleVariation } from '../types'

export const gridoutVar = simpleVariation(
  'gridoutVar',
  (pos, varInfo) => {
    'use gpu'
    const x = round(pos.x)
    const y = round(pos.y)

    let outX = pos.x
    let outY = pos.y

    if (y <= 0.0) {
      if (x > 0.0) {
        if (-y >= x) {
          outX = pos.x + 1.0
          outY = pos.y
        } else {
          outX = pos.x
          outY = pos.y + 1.0
        }
      } else {
        if (y <= x) {
          outX = pos.x + 1.0
          outY = pos.y
        } else {
          outX = pos.x
          outY = pos.y - 1.0
        }
      }
    } else {
      if (x > 0.0) {
        if (y >= x) {
          outX = pos.x - 1.0
          outY = pos.y
        } else {
          outX = pos.x
          outY = pos.y + 1.0
        }
      } else {
        if (y > -x) {
          outX = pos.x - 1.0
          outY = pos.y
        } else {
          outX = pos.x
          outY = pos.y - 1.0
        }
      }
    }

    return vec2f(outX, outY).mul(varInfo.weight)
  },
  'general',
)
