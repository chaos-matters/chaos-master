import { vec2f } from 'typegpu/data'
import { abs, cos, select, sin, sqrt } from 'typegpu/std'
import { random } from '@/shaders/random'
import { PI } from '../../../constants'
import { simpleVariation } from '../types'

export const blurCircle = simpleVariation(
  'blurCircleVar',
  (_pos, varInfo) => {
    'use gpu'
    const weight = varInfo.weight
    const randX = 2.0 * random() - 1.0
    const randY = 2.0 * random() - 1.0
    const absX = abs(randX)
    const absY = abs(randY)

    let side = absX
    let perimeter = absX
    if (absX >= absY) {
      side = absX
      perimeter = select(5.0 * absX - randY, absX + randY, randX >= absY)
    } else {
      side = absY
      perimeter = select(7.0 * absY + randX, 3.0 * absY - randX, randY >= absX)
    }

    const r = weight * side
    const theta = (PI.$ / 4.0) * (perimeter / side) - PI.$ / 4.0
    return vec2f(r * cos(theta), r * sin(theta))
  },
  'blur',
)

export const gaussianBlur = simpleVariation(
  'gaussianBlurVar',
  (_pos, _varInfo) => {
    'use gpu'
    const r = random() + random() + random() + random() - 2.0
    const theta = random() * 2.0 * PI.$
    return vec2f(cos(theta), sin(theta)).mul(r)
  },
  'blur',
)

export const circleBlur = simpleVariation(
  'circleBlurVar',
  (_pos, _varInfo) => {
    'use gpu'
    const rad = sqrt(random())
    const a = random() * 2.0 * PI.$
    return vec2f(cos(a), sin(a)).mul(rad)
  },
  'blur',
)
