import { vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { simpleVariation } from '../types'

export const postRotateVar = simpleVariation(
  'postRotateVar',
  (pos, varInfo) => {
    'use gpu'
    const a = varInfo.weight
    return vec2f(
      pos.x * cos(a) - pos.y * sin(a),
      pos.x * sin(a) + pos.y * cos(a),
    )
  },
  'post',
)
