import { vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { simpleVariation } from '../types'

export const postSpinZ = simpleVariation(
  'postSpinZVar',
  (pos, varInfo) => {
    'use gpu'
    const angle = varInfo.weight * 1.57079632679
    const s = sin(angle)
    const c = cos(angle)
    const nx = s * pos.y + c * pos.x
    const ny = c * pos.y - s * pos.x
    return vec2f(nx, ny)
  },
  'post',
)
