import { vec2f } from 'typegpu/data'
import { abs, select } from 'typegpu/std'
import { EPS } from '../../../constants'
import { simpleVariation } from '../types'

export const holesqVar = simpleVariation(
  'holesqVar',
  (pos, varInfo) => {
    'use gpu'
    const w = select(varInfo.weight, EPS.$, varInfo.weight === 0.0)
    const x = w * pos.x
    const y = w * pos.y
    const fax = abs(x)
    const fay = abs(y)

    const big = fax + fay > 1.0
    const faxGtFay = fax > fay

    const t1 = select((x + fay - 1.0) * 0.5, (x - fay + 1.0) * 0.5, x > 0.0)
    const t2 = select((y + fax - 1.0) * 0.5, (y - fax + 1.0) * 0.5, y > 0.0)

    const newX = select(select(x, t1, faxGtFay), x, big) / w
    const newY = select(select(t2, y, faxGtFay), y, big) / w
    return vec2f(newX, newY)
  },
  'general',
)
