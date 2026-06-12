import { vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { PI } from '../../../constants'
import { simpleVariation } from '../types'

export const preSpinZ = simpleVariation(
  'preSpinZVar',
  (pos, varInfo) => {
    'use gpu'
    const a = (varInfo.weight * PI.$) / 2.0
    return vec2f(
      pos.x * cos(a) + pos.y * sin(a),
      -pos.x * sin(a) + pos.y * cos(a),
    )
  },
  'pre',
)
