import { vec2f } from 'typegpu/data'
import { atan2, log, sqrt } from 'typegpu/std'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { simpleVariation } from '../types'

export const acoshVar = simpleVariation(
  'acoshVar',
  (pos, varInfo) => {
    'use gpu'

    const z2_re = pos.x * pos.x - pos.y * pos.y
    const z2_im = 2.0 * pos.x * pos.y

    const sub_re = z2_re - 1.0
    const sub_im = z2_im

    const r_sub = sqrt(sub_re * sub_re + sub_im * sub_im)
    const sqrt_re = sqrt((r_sub + sub_re) * 0.5)
    let sqrt_im = sqrt((r_sub - sub_re) * 0.5)
    if (sub_im < 0.0) sqrt_im = -sqrt_im

    const term_re = pos.x + sqrt_re
    const term_im = pos.y + sqrt_im

    const r_term = sqrt(term_re * term_re + term_im * term_im)
    const phi_term = atan2(term_im, term_re)

    let res_re = log(r_term)
    let res_im = phi_term

    const scale = varInfo.weight * 2.0 * PI.$
    res_re *= scale
    res_im *= scale

    if (random() < 0.5) {
      return vec2f(res_re, res_im)
    } else {
      return vec2f(-res_re, -res_im)
    }
  },
  'general',
)
