import { f32, vec2f } from 'typegpu/data'
import { cos, cosh, select, sin, sinh, sqrt } from 'typegpu/std'
import { simpleVariation } from '../types'

export const sinhqVar = simpleVariation(
  'sinhqVar',
  (pos, varInfo) => {
    'use gpu'

    const z = f32(0.0)
    const abs_v = sqrt(pos.y * pos.y + z * z)
    const s = sin(abs_v)
    const c = cos(abs_v)
    const sh = sinh(pos.x)
    const ch = cosh(pos.x)

    const C = (ch * s) / select(abs_v, 1.0e-9, abs_v === 0.0)

    const newX = sh * c
    const newY = C * pos.y

    return vec2f(newX, newY).mul(varInfo.weight)
  },
  'general',
)
