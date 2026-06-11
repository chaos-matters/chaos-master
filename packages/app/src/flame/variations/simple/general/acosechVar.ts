import { vec2f } from 'typegpu/data'
import { atan2, log, sqrt } from 'typegpu/std'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { simpleVariation } from '../types'

export const acosechVar = simpleVariation(
  'acosechVar',
  (pos, varInfo) => {
    'use gpu'

    const denom = pos.x * pos.x + pos.y * pos.y + 1.0e-10
    const w_re = pos.x / denom
    const w_im = -pos.y / denom

    const w2_re = w_re * w_re - w_im * w_im
    const w2_im = 2.0 * w_re * w_im

    const sub_re = w2_re - 1.0
    const sub_im = w2_im

    const r_sub = sqrt(sub_re * sub_re + sub_im * sub_im)
    const sqrt_re = sqrt((r_sub + sub_re) * 0.5)
    let sqrt_im = sqrt((r_sub - sub_re) * 0.5)
    if (sub_im < 0.0) sqrt_im = -sqrt_im

    const term_re = w_re + sqrt_re
    const term_im = w_im + sqrt_im

    const r_term = sqrt(term_re * term_re + term_im * term_im)
    const phi_term = atan2(term_im, term_re)

    let z_re = log(r_term)
    let z_im = phi_term

    const temp = z_re
    z_re = z_im
    z_im = temp

    const scale = varInfo.weight * 2.0 * PI.$
    z_re *= scale
    z_im *= scale

    if (random() < 0.5) {
      return vec2f(z_re, z_im)
    } else {
      return vec2f(-z_re, -z_im)
    }
  },
  'general',
)
