import { vec2f } from 'typegpu/data'
import { acos, clamp, cos, cosh, log, select, sin, sinh, sqrt, } from 'typegpu/std'
import { EPS } from '../../../constants'
import { safeDenom } from '../../safeMath'
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
    const a1 = log(xmax + select(0.0, sqrt(xmax - 1.0), xmax - 1.0 >= EPS.$))
    const a2 = -acos(clamp(pos.x / safeDenom(xmax), -1.0, 1.0))
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
