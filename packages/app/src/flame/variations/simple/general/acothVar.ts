import { vec2f } from 'typegpu/data'
import { atan2, log, sqrt } from 'typegpu/std'
import { PI } from '@/flame/constants'
import { simpleVariation } from '../types'

export const acothVar = simpleVariation(
  'acothVar',
  (pos, varInfo) => {
    'use gpu'

    const n_re = pos.x + 1.0
    const n_im = pos.y

    const d_re = pos.x - 1.0
    const d_im = pos.y

    const div_denom = d_re * d_re + d_im * d_im + 1.0e-10
    const q_re = (n_re * d_re + n_im * d_im) / div_denom
    const q_im = (n_im * d_re - n_re * d_im) / div_denom

    const r_q = sqrt(q_re * q_re + q_im * q_im)
    const phi_q = atan2(q_im, q_re)

    let z_re = 0.5 * log(r_q)
    let z_im = 0.5 * phi_q

    const temp = z_re
    z_re = z_im
    z_im = temp

    const scale = varInfo.weight * 2.0 * PI.$
    z_re *= scale
    z_im *= scale

    return vec2f(z_re, z_im)
  },
  'general',
)
