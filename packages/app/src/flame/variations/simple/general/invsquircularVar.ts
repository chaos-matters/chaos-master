import { vec2f } from 'typegpu/data'
import { select, sqrt } from 'typegpu/std'
import { EPS } from '../../../constants'
import { simpleVariation } from '../types'

export const invsquircularVar = simpleVariation(
  'invsquircularVar',
  (pos, varInfo) => {
    'use gpu'
    const w = select(varInfo.weight, EPS.$, varInfo.weight === 0.0)
    const u = pos.x + EPS.$
    const v = pos.y + EPS.$
    const r = u * u + v * v
    // r * (w^2 * r - 4*u^2*v^2) / w
    const inner = (r * (w * w * r - 4.0 * u * u * v * v)) / w
    const safeInner = select(inner, 0.0, inner < 0.0)
    const r2 = sqrt(safeInner)
    const rNew = sqrt(r - r2) / 1.4142135623730951 // M_SQRT2
    return vec2f(rNew / u / w, rNew / v / w)
  },
  'general',
)
