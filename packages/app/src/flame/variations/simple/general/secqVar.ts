import { f32, vec2f } from 'typegpu/data'
import { cos, cosh, select, sin, sinh, sqrt } from 'typegpu/std'
import { simpleVariation } from '../types'

export const secqVar = simpleVariation(
  'secqVar',
  (pos, varInfo) => {
    'use gpu'

    const z = f32(0.0)
    const abs_v = sqrt(pos.y * pos.y + z * z)
    const s = sin(-pos.x)
    const c = cos(-pos.x)
    const sh = sinh(abs_v)
    const ch = cosh(abs_v)
    const denom = pos.x * pos.x + pos.y * pos.y + z * z
    const ni = 1.0 / select(denom, 1.0e-9, denom === 0.0)
    const eps_v = select(abs_v, 1.0e-9, abs_v === 0.0)
    const C = (ni * s * sh) / eps_v

    const newX = c * ch * ni
    const newY = -C * pos.y

    return vec2f(newX, newY).mul(varInfo.weight)
  },
  'general',
)
