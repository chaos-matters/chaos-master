import { defineExample, tid, vid } from './util'

/**
 * Temporal Flux — Complex power orbits trace Lissajous time curves while
 * trade atttractor dualities create flux-pinned energy patterns.
 */
export const example17 = defineExample({
  version: '1.0',
  metadata: {
    author: 'unknown',
    name: 'Temporal Flux',
    description:
      'Complex power orbits trace Lissajous time curves while trade atttractor dualities create flux-pinned energy patterns.',
  },
  renderSettings: {
    exposure: 0.3,
    skipIters: 20,
    drawMode: 'light',
    camera: {
      zoom: 1.3,
      position: [0, 0],
    },
  },
  transforms: {
    // T0: CPow2 + swirl — complex power orbits with swirl distortion
    [tid('a1b2c3d4_e5f6_3456_7890_abcdef012345')]: {
      probability: 0.5,
      preAffine: { a: 0.55, b: -0.05, c: 0, d: 0.05, e: 0.55, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.3, y: 0.05 },
      variations: {
        [vid('b2c3d4e5_f6a7_3456_8901_bcdef0123456')]: {
          type: 'cpow2Var',
          weight: 1,
          params: { r: 0.68, a: 0.1, divisor: 4, range: 6 },
        },
        [vid('c3d4e5f6_a7b8_3456_9012_cdef01234567')]: {
          type: 'swirlVar',
          weight: 0.2,
        },
      },
    },
    // T1: Lissajous + sinusoidal — orbital time curves with sine undulation
    [tid('d4e5f6a7_b8c9_3456_0123_def012345678')]: {
      probability: 0.45,
      preAffine: { a: 0.4, b: 0.1, c: -0.03, d: -0.1, e: 0.4, f: 0.03 },
      postAffine: { a: 0.7, b: 0, c: 0, d: 0, e: 0.7, f: 0 },
      color: { x: -0.15, y: -0.1 },
      variations: {
        [vid('e5f6a7b8_c9d0_3456_1234_ef0123456789')]: {
          type: 'lissajousVar',
          weight: 1,
          params: {
            tmin: -Math.PI,
            tmax: Math.PI,
            a: 3.0,
            b: 2.0,
            c: 0.0,
            d: 0.0,
            e: 0.0,
          },
        },
        [vid('f6a7b8c9_d0e1_3456_2345_01234567890a')]: {
          type: 'sinusoidalVar',
          weight: 0.3,
        },
      },
    },
    // T2: Trade + cosine — dual-attractor trade with cosine modulation
    [tid('a7b8c9d0_e1f2_3456_3456_1234567890ab')]: {
      probability: 0.3,
      preAffine: { a: 0.35, b: 0, c: 0, d: 0, e: 0.35, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.05, y: -0.3 },
      variations: {
        [vid('b8c9d0e1_f2a3_3456_4567_234567890abc')]: {
          type: 'tradeVar',
          weight: 1,
          params: { r1: 1.0, d1: 1.0, r2: 1.0, d2: 1.0 },
        },
        [vid('c9d0e1f2_a3b4_3456_5678_34567890abcd')]: {
          type: 'cosineVar',
          weight: 0.25,
        },
      },
    },
  },
})
