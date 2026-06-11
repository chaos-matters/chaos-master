import { vec2f } from 'typegpu/data'
import { sin } from 'typegpu/std'
import { EPS } from '@/flame/constants'
import { simpleVariation } from '../types'

export const wavesVar = simpleVariation(
  'wavesVar',
  (pos, varInfo) => {
    'use gpu'
    const T = varInfo.affineCoefs
    const xSinArg = pos.y / (T.c * T.c + EPS.$)
    const ySinArg = pos.x / (T.f * T.f + EPS.$)
    const delta = vec2f(T.b * sin(xSinArg), T.e * sin(ySinArg))
    return pos.add(delta).mul(varInfo.weight)
  },
  'general',
)
