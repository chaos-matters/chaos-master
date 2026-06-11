import { vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { random } from '@/shaders/random'
import { PI } from '../../../constants'
import { simpleVariation } from '../types'

export const preBlur = simpleVariation(
  'preBlurVar',
  (_pos, varInfo) => {
    'use gpu'
    const r =
      varInfo.weight *
      (random() + random() + random() + random() + random() + random() - 3.0)
    const theta = random() * 2.0 * PI.$
    return vec2f(r * cos(theta), r * sin(theta))
  },
  'pre',
)
