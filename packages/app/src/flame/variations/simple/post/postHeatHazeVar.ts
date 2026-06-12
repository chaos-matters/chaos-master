import { vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { simpleVariation } from '../types'

// Heat distortion: wave displacement creates heat haze effect
export const postHeatHazeVar = simpleVariation(
  'postHeatHazeVar',
  (pos, varInfo) => {
    'use gpu'
    const wave = sin(pos.x * 5.0) * cos(pos.y * 3.0) * 0.1
    const wave2 = cos(pos.y * 7.0) * sin(pos.x * 4.0) * 0.1
    return vec2f(pos.x + wave, pos.y + wave2).mul(varInfo.weight)
  },
  'post',
)
