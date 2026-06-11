import { vec2f } from 'typegpu/data'
import { simpleVariation } from '../types'

export const postSpherical = simpleVariation(
  'postSphericalVar',
  (pos, varInfo) => {
    'use gpu'
    const r = varInfo.weight / (pos.x * pos.x + pos.y * pos.y + 1e-6)
    return vec2f(pos.x * r, pos.y * r)
  },
  'post',
)
