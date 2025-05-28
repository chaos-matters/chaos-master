import { tid, vid } from './util'
import type { FlameDescriptor } from '../transformFunction'

export const example7: FlameDescriptor = {
  renderSettings: {
    exposure: 0.137,
    skipIters: 30,
    drawMode: 'light',
    backgroundColor: [119 / 255, 81 / 255, 210 / 255],
  },
  transforms: {
    [tid('c67f51f5_8e1d_435e_bc36_cc90566d431d')]: {
      probability: 1,
      preAffine: {
        c: -0.6042054161101547,
        f: 0.6701180963023929,
        a: 0.4089259453553665,
        b: -0.28877227665901745,
        d: 0.28877227665901745,
        e: 0.4089259453553665,
      },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: -0.305588355119493, y: 0.04668761144581765 },
      variations: {
        [vid('f80c6b85_beed_4f6b_84e8_3d5815bbba82')]: {
          type: 'linear',
          weight: 1,
        },
      },
    },
    [tid('bd58e89c_0adc_49c2_894f_36ae780d155e')]: {
      probability: 1,
      color: { x: 0.18431274024029293, y: -0.06548163630843476 },
      preAffine: {
        c: 0.9818205416917333,
        f: 0.20349903719136225,
        a: 0.5988955229607208,
        b: 0.06236563566565948,
        d: -0.06236563566565948,
        e: 0.5988955229607208,
      },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      variations: {
        [vid('1570e063_f0cb_48b5_91c1_256bf1bb5523')]: {
          type: 'linear',
          weight: 1,
        },
      },
    },
    [tid('c131f88f_cc75_4da0_97c0_42e2e3c52ed9')]: {
      probability: 1,
      color: { x: -0.09807017231174976, y: -0.13855890047833586 },
      preAffine: {
        c: -1.4560747398821912,
        f: -0.5277059421545582,
        a: 0.472856414160609,
        b: 0.24463308792368213,
        d: -0.24463308792368213,
        e: 0.472856414160609,
      },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      variations: {
        [vid('0db54b7c_b4f3_4b84_ba4f_a645406da878')]: {
          type: 'linear',
          weight: 1,
        },
      },
    },
  },
}
