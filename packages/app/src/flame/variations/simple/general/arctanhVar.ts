import { vec2f } from 'typegpu/data'
import { atan2, log, sqrt } from 'typegpu/std'
import { PI } from '@/flame/constants'
import { simpleVariation } from '../types'

export const arctanhVar = simpleVariation(
  'arctanhVar',
  (pos, varInfo) => {
    'use gpu'

    const n_re = 1.0 + pos.x
    const n_im = pos.y

    const d_re = 1.0 - pos.x
    const d_im = -pos.y

    const denom = d_re * d_re + d_im * d_im + 1.0e-10
    const q_re = (n_re * d_re + n_im * d_im) / denom
    const q_im = (n_im * d_re - n_re * d_im) / denom

    const r_q = sqrt(q_re * q_re + q_im * q_im)
    const phi_q = atan2(q_im, q_re)

    let res_re = log(r_q)
    let res_im = phi_q

    const scale = varInfo.weight * 2.0 * PI.$
    res_re *= scale
    res_im *= scale

    return vec2f(res_re, res_im)
  },
  'general',
)
