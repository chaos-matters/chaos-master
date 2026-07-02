import { f32, vec2f } from 'typegpu/data'
import { cos, cosh, sin, sinh, sqrt } from 'typegpu/std'
import { safeDenom } from '../../safeMath'
import { simpleVariation } from '../types'

export const cschqVar = simpleVariation(
  'cschqVar',
  (pos, varInfo) => {
    'use gpu'

    const z = f32(0.0)
    const abs_v = sqrt(pos.y * pos.y + z * z)
    const s = sin(abs_v)
    const c = cos(abs_v)
    const sh = sinh(pos.x)
    const ch = cosh(pos.x)

    const denom = pos.x * pos.x + pos.y * pos.y + z * z
    const ni = varInfo.weight / safeDenom(denom)

    const C = (ni * ch * s) / safeDenom(abs_v)

    const newX = sh * c * ni
    const newY = -(C * pos.y)

    return vec2f(newX, newY)
  },
  'general',
)
