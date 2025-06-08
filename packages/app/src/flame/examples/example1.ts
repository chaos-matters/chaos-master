import { tid, vid } from './util'
import type { FlameDescriptor } from '../transformFunction'

export const example1: FlameDescriptor = {
  renderSettings: {
    exposure: 0.25,
    skipIters: 20,
    drawMode: 'light',
    camera: {
      zoom: 1,
      position: [0, 0],
    },
  },
  transforms: {
    [tid('55d4c43f_14b8_4554_a9d1_a94eda857811')]: {
      probability: 0.4,
      preAffine: { a: 0.8, b: 0, c: 0.5, d: 0, e: 0.6, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.1, y: 0.25 },
      variations: {
        [vid('44890d73_369c_4ed1_a1f5_1d7adf71a8ff')]: {
          type: 'linear',
          weight: 1,
        },
      },
    },
    [tid('d063e601_ba48_4940_a4c2_6b12219d7030')]: {
      probability: 0.3,
      preAffine: { a: 0.7, b: 0.3, c: 0.1, d: 0, e: 0.6, f: 0.5 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: -0.3, y: 0.1 },
      variations: {
        [vid('3c38f125_0e23_4b5a_9ee8_f67be2bf5df9')]: {
          type: 'linear',
          weight: 0.4,
        },
        [vid('07e2f213_93f5_4198_b41e_7c833cad08bb')]: {
          type: 'swirl',
          weight: 0.5,
        },
        [vid('08c5a1d5_f86f_4f1e_973c_6cd4dc8065bb')]: {
          type: 'popcorn',
          weight: 0.1,
        },
      },
    },
    [tid('d9adaf84_30f1_48ec_b61b_b386fa0b4a5c')]: {
      probability: 0.2,
      preAffine: { a: 0.6, b: 0.5, c: -0.5, d: 0, e: 0.5, f: -0.5 },
      postAffine: { a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 },
      color: { x: 0, y: -0.3 },
      variations: {
        [vid('0dd9067e_a5ff_49e6_9a33_08e818a22d51')]: {
          type: 'pie',
          weight: 0.95,
          params: { rotation: 0, slices: 5, thickness: 0.5 },
        },
        [vid('04326f54_0068_4f7d_97fa_7329e5a7b5fd')]: {
          type: 'gaussian',
          weight: 0.05,
        },
      },
    },
    [tid('dd664b5b_c451_411a_b84a_606f1c31e8e4')]: {
      probability: 0.1,
      preAffine: { a: 0.6, b: 0.5, c: -0.5, d: 0, e: 0.5, f: -0.5 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 1, y: 0 },
      variations: {
        [vid('86071f73_0259_46dd_b421_56025ce57ff2')]: {
          type: 'sinusoidal',
          weight: 1,
        },
      },
    },
  },
}
