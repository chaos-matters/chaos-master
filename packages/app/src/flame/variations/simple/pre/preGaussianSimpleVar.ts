import { vec2f } from 'typegpu/data'
import { cos, log, sin, sqrt } from 'typegpu/std'
import { random } from '@/shaders/random'
import { PI } from '../../../constants'
import { simpleVariation } from '../types'

export const preGaussianSimpleVar = simpleVariation(
  'preGaussianSimpleVar',
  (_pos, varInfo) => {
    'use gpu'
    const u1 = random()
    const u2 = random()
    const r = sqrt(-2.0 * log(u1 + 1e-10)) * 0.3
    return vec2f(r * cos(PI.$ * 2.0 * u2), r * sin(PI.$ * 2.0 * u2)).mul(
      varInfo.weight,
    )
  },
  'pre',
)
