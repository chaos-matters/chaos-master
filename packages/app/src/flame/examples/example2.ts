import { tid, vid } from './util'
import type { FlameDescriptor } from '../transformFunction'

export const example2: FlameDescriptor = {
  renderSettings: {
    exposure: 0.25,
    skipIters: 20,
    drawMode: 'light',
  },
  transforms: {
    [tid('bfa7d299_b9d5_4a27_ba63_e578c4d13e84')]: {
      probability: 1,
      preAffine: {
        c: -0.39342588307431203,
        f: -0.4000237709717733,
        a: -0.371320360333943,
        b: 0.5373749308167314,
        d: -0.5373749308167314,
        e: -0.371320360333943,
      },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: -1, f: 0 },
      color: { x: 0.20738714813221648, y: 0.10064295041753546 },
      variations: {
        [vid('5c4a50b4_9b04_4105_aacb_7d455ac00dc2')]: {
          type: 'juliaScope',
          params: { power: 3, dist: 3.65 },
          weight: 1,
        },
      },
    },
    [tid('da4634e6_3ecc_4063_923d_1e22a297d7a6')]: {
      probability: 0.689,
      color: { x: -0.295884684632211, y: -0.04952023222983735 },
      preAffine: {
        c: 0.842659464284378,
        f: -0.10846075883770356,
        a: -0.17287166195131382,
        b: -0.38530246331463686,
        d: 0.38530246331463686,
        e: -0.17287166195131382,
      },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      variations: {
        [vid('6f0d8526_b8a7_4b0a_a06f_f829ded35840')]: {
          type: 'juliaScope',
          params: { power: 5, dist: 2.35 },
          weight: 0.847,
        },
      },
    },
  },
}
