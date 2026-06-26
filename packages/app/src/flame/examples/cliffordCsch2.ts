import { defineExample, tid, vid } from './util'

// Clifford attractor woven with csch2_bs (plus swirl, popcorn, pie). Also the
// repro flame for the Mitchell-Netravali stochastic-filter grain fix — toggle
// the MN filter and pan/zoom to exercise it.
export const cliffordCsch2 = defineExample({
  metadata: {
    name: 'Clifford Reverie',
    author: 'unknown',
    description:
      'Clifford attractor woven with csch2_bs, swirl and popcorn — a colourful 2D reverie.',
  },
  renderSettings: {
    exposure: 0.25,
    skipIters: 20,
    drawMode: 'light',
    vibrancy: 0.5,
    contrast: 1,
    gamma: 2.2,
    densityEstimationQuality: 0.8,
    estimatorCurve: 0.5,
    camera: { zoom: 1, position: [0, 0], rotation: 0 },
  },
  transforms: {
    [tid('55d4c43f_14b8_4554_a9d1_a94eda857811')]: {
      probability: 0.4,
      preAffine: { a: 0.8, b: 0, c: 0.5, d: 0, e: 0.6, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.1, y: 0.25 },
      colorSpeed: 0.4,
      variations: {
        [vid('44890d73_369c_4ed1_a1f5_1d7adf71a8ff')]: {
          type: 'cliffordVar',
          params: { a: -1.4, b: 1.6, c: 1, d: 0.7 },
          weight: 1,
        },
      },
    },
    [tid('d063e601_ba48_4940_a4c2_6b12219d7030')]: {
      probability: 0.3,
      preAffine: { a: 0.7, b: 0.3, c: 0.1, d: 0, e: 0.6, f: 0.5 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: -0.3, y: 0.1 },
      colorSpeed: 0.4,
      variations: {
        [vid('3c38f125_0e23_4b5a_9ee8_f67be2bf5df9')]: {
          type: 'csch2_bsVar',
          params: { x1: 1, x2: 1, y1: 1, y2: 1 },
          weight: 0.4,
        },
        [vid('07e2f213_93f5_4198_b41e_7c833cad08bb')]: {
          type: 'swirlVar',
          weight: 0.5,
        },
        [vid('08c5a1d5_f86f_4f1e_973c_6cd4dc8065bb')]: {
          type: 'popcornVar',
          weight: 0.1,
        },
      },
    },
    [tid('d9adaf84_30f1_48ec_b61b_b386fa0b4a5c')]: {
      probability: 0.2,
      preAffine: { a: 0.6, b: 0.5, c: -0.5, d: 0, e: 0.5, f: -0.5 },
      postAffine: { a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 },
      color: { x: 0, y: -0.3 },
      colorSpeed: 0.4,
      variations: {
        [vid('0dd9067e_a5ff_49e6_9a33_08e818a22d51')]: {
          type: 'pieVar',
          params: { slices: 5, rotation: 0, thickness: 0.5 },
          weight: 0.95,
        },
        [vid('04326f54_0068_4f7d_97fa_7329e5a7b5fd')]: {
          type: 'gaussianVar',
          weight: 0.05,
        },
      },
    },
    [tid('dd664b5b_c451_411a_b84a_606f1c31e8e4')]: {
      probability: 0.1,
      preAffine: { a: 0.6, b: 0.5, c: -0.5, d: 0, e: 0.5, f: -0.5 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 1, y: 0 },
      colorSpeed: 0.4,
      variations: {
        [vid('86071f73_0259_46dd_b421_56025ce57ff2')]: {
          type: 'sinusoidalVar',
          weight: 1,
        },
      },
    },
  },
})
