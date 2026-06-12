import { vec2f } from 'typegpu/data'
import { cos, sin, sqrt } from 'typegpu/std'
import { random } from '@/shaders/random'
import { PI } from '../../../constants'
import { simpleVariation } from '../types'

export const circleBlurVar = simpleVariation(
  'circleBlurVar',
  (_pos, varInfo) => {
    'use gpu'
    const rad = sqrt(random())
    const a = random() * PI.$ * 2.0
    return vec2f(cos(a) * rad, sin(a) * rad).mul(varInfo.weight)
  },
  'blur',
)
