import { vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { random } from '@/shaders/random'
import { PI } from '../../../constants'
import { simpleVariation } from '../types'

export const chrysanthemumVar = simpleVariation(
  'chrysanthemumVar',
  (_pos, varInfo) => {
    'use gpu'
    const u = 21.0 * PI.$ * random()
    const p4 = sin((17.0 * u) / 3.0)
    const p8 = sin(2.0 * cos(3.0 * u) - 28.0 * u)
    const p4Pow4 = p4 * p4 * p4 * p4
    const p8Pow8 = p8 * p8 * p8 * p8 * p8 * p8 * p8 * p8
    const r =
      0.1 * (5.0 * (1.0 + sin((11.0 * u) / 5.0)) - 4.0 * p4Pow4 * p8Pow8)
    return vec2f(r * cos(u), r * sin(u)).mul(varInfo.weight)
  },
  'general',
)
