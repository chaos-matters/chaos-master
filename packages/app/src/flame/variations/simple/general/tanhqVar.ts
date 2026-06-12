import { f32, vec2f } from 'typegpu/data'
import { cos, cosh, select, sin, sinh, sqrt } from 'typegpu/std'
import { simpleVariation } from '../types'

export const tanhqVar = simpleVariation(
  'tanhqVar',
  (pos, varInfo) => {
    'use gpu'

    const z = f32(0.0)
    const abs_v = sqrt(pos.y * pos.y + z * z)
    const sysz = pos.y * pos.y + z * z
    const denom = pos.x * pos.x + sysz
    const ni = 1.0 / select(denom, 1.0e-9, denom === 0.0)

    const s = sin(abs_v)
    const c = cos(abs_v)
    const sh = sinh(pos.x)
    const ch = cosh(pos.x)

    const eps_v = select(abs_v, 1.0e-9, abs_v === 0.0)
    const C = (ch * s) / eps_v
    const B = (sh * s) / eps_v

    const stcv = sh * c
    const ctcv = ch * c

    const newX = (stcv * ctcv + C * B * sysz) * ni
    const newY = (-stcv * B + C * ctcv) * pos.y * ni

    return vec2f(newX, newY).mul(varInfo.weight)
  },
  'general',
)
