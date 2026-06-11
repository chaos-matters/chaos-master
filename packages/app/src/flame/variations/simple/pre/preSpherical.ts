import { dot } from 'typegpu/std'
import { EPS } from '../../../constants'
import { simpleVariation } from '../types'

export const preSpherical = simpleVariation(
  'preSphericalVar',
  (pos, varInfo) => {
    'use gpu'
    const r = 1.0 / (dot(pos, pos) + EPS.$)
    return pos.mul(r).mul(varInfo.weight)
  },
  'pre',
)
