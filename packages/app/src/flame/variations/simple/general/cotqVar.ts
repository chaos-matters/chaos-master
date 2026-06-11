import { f32, vec2f } from 'typegpu/data'
import { cos, cosh, select, sin, sinh, sqrt } from 'typegpu/std'
import { simpleVariation } from '../types'

export const cotqVar = simpleVariation(
  'cotqVar',
  (pos, varInfo) => {
    'use gpu'

    const z = f32(0.0)
    const abs_v = sqrt(pos.y * pos.y + z * z)
    const s = sin(pos.x)
    const c = cos(pos.x)
    const sh = sinh(abs_v)
    const ch = cosh(abs_v)
    const sysz = pos.y * pos.y + z * z
    const denom = pos.x * pos.x + sysz
    const ni = 1.0 / select(denom, 1.0e-9, denom === 0.0)
    const eps_v = select(abs_v, 1.0e-9, abs_v === 0.0)
    const C = (c * sh) / eps_v
    const B = (-s * sh) / eps_v
    const stcv = s * ch
    const nstcv = -stcv
    const ctcv = c * ch

    const newX = (stcv * ctcv + C * B * sysz) * ni
    const newY = -(nstcv * B + C * ctcv) * pos.y * ni

    return vec2f(newX, newY).mul(varInfo.weight)
  },
  'general',
)
