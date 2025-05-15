import { tid, vid } from './util'
import type { FlameDescriptor } from '../transformFunction'

export const example3: FlameDescriptor = {
  renderSettings: {
    exposure: 0.2,
    skipIters: 20,
    drawMode: 'light',
  },
  transforms: {
    [tid('2fa2980e_6df0_4735_8334_052f42d6639d')]: {
      probability: 0.1,
      preAffine: {
        a: 1,
        b: 0,
        c: -0.0015204710978657804,
        d: 0,
        e: 1,
        f: -0.0007397004927711878,
      },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: -1, f: 0 },
      color: { x: 0, y: 0 },
      variations: {
        [vid('37cc2da4_eedb_491b_88f4_144b2152336c')]: {
          type: 'juliaN',
          params: { power: 1, dist: 2 },
          weight: 1,
        },
      },
    },
    [tid('22e663b9_af32_4000_8416_3075891360a2')]: {
      probability: 0.1,
      color: { x: 0, y: 0 },
      preAffine: {
        a: 1,
        b: 0,
        c: 0.357993699581687,
        d: 0,
        e: 1,
        f: -0.01634648933264489,
      },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      variations: {
        [vid('095913d7_51cf_4912_9eb5_0392e0884060')]: {
          type: 'eyefish',
          weight: 1,
        },
      },
    },
    [tid('78b551cf_f418_48a1_876e_b75adc80fd70')]: {
      probability: 0.1,
      color: { x: 0.009677435415016582, y: -0.2998438714461047 },
      preAffine: {
        c: -0.2341240798160174,
        f: 0.0025485527424406185,
        a: 0.8772614878717728,
        b: -0.0034839054925084626,
        d: 0,
        e: 1,
      },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      variations: {
        [vid('163d876f_8482_4a0b_8e83_e8404fc51930')]: {
          type: 'linear',
          weight: 1,
        },
      },
    },
  },
}
