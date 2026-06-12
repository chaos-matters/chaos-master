import { vec2f } from 'typegpu/data'
import { acos, cos, cosh, log, select, sin, sinh, sqrt } from 'typegpu/std'
import { simpleVariation } from '../types'

export const ediscVar = simpleVariation(
  'ediscVar',
  (pos, varInfo) => {
    'use gpu'
    const r2_val = pos.x * pos.x + pos.y * pos.y
    const tmp = r2_val + 1.0
    const tmp2 = 2.0 * pos.x
    const r1 = sqrt(tmp + tmp2)
    const r2 = sqrt(tmp - tmp2)
    const xmax = (r1 + r2) * 0.5
    const a1 = log(xmax + sqrt(xmax - 1.0))
    const a2 = -acos(pos.x / select(xmax, 1.0e-9, xmax === 0.0))
    let snv = sin(a1)
    const csv = cos(a1)
    const snhu = sinh(a2)
    const cshu = cosh(a2)
    if (pos.y > 0.0) {
      snv = -snv
    }
    const w = varInfo.weight
    const newX = w * cshu * csv
    const newY = w * snhu * snv
    return vec2f(newX, newY)
  },
  'general',
)
