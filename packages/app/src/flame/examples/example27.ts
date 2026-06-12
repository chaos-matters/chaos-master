import { defineExample, tid, vid } from './util'

/**
 * Post-Spiral Galaxy — Dramatic postAffine transforms that warp variation
 * output into spiral galaxy morphology. Each transform applies a different
 * postAffine rotation+shear, creating layered spiral arms.
 * Rendered in paint mode for nebulous glow.
 */
export const example27 = defineExample({
  version: '1.0',
  metadata: {
    author: 'unknown',
    name: 'Post-Spiral Galaxy',
    description:
      'Dramatic postAffine transforms that warp variation output into spiral galaxy morphology. Each transform applies a different postAffine rotation+shear, creating layered spiral arms. Rendered in paint mode for nebulous glow.',
  },
  renderSettings: {
    exposure: 0.3,
    skipIters: 20,
    drawMode: 'light',
    vibrancy: 0.55,
    contrast: 1.0,
    gamma: 2.0,
    highlightPower: 0.5,
    camera: {
      zoom: 1.0,
      position: [0, 0],
    },
  },
  transforms: {
    // T0: Core swirl — tight spiral with strong postAffine rotation
    [tid('a1b2c3d4_e5f6_027a_7890_abcdef123456')]: {
      probability: 0.4,
      preAffine: { a: 0.6, b: 0, c: 0, d: 0, e: 0.6, f: 0 },
      // postAffine: 25° rotation + slight shear creates spiraling
      postAffine: { a: 0.85, b: -0.35, c: 0.02, d: 0.15, e: 0.9, f: 0 },
      color: { x: 0.5, y: 0.2 },
      colorSpeed: 0.3,
      variations: {
        [vid('b2c3d4e5_f6a7_027b_8901_bcdef1234567')]: {
          type: 'swirlVar',
          weight: 0.8,
        },
        [vid('c3d4e5f6_a7b8_027c_9012_cdef12345678')]: {
          type: 'sinusoidalVar',
          weight: 0.2,
        },
      },
    },
    // T1: Outer arm — larger orbit with gentle postAffine shear
    [tid('d4e5f6a7_b8c9_027d_0123_def123456789')]: {
      probability: 0.35,
      preAffine: { a: 0.7, b: 0.05, c: 0, d: -0.05, e: 0.7, f: 0.1 },
      // postAffine: gentle counter-rotation + Y-stretch for elongated arm
      postAffine: { a: 0.95, b: 0.15, c: 0, d: -0.08, e: 1.15, f: 0 },
      color: { x: -0.2, y: -0.15 },
      colorSpeed: 0.35,
      variations: {
        [vid('e5f6a7b8_c9d0_027e_1234_ef1234567890')]: {
          type: 'hyperbolicVar',
          weight: 0.7,
        },
        [vid('f6a7b8c9_d0e1_027f_2345_01234567890a')]: {
          type: 'sinusoidalVar',
          weight: 0.3,
        },
      },
    },
    // T2: Nebula haze — diffuse spread with strong postAffine shear
    [tid('a7b8c9d0_e1f2_027g_3456_1234567890ab')]: {
      probability: 0.25,
      preAffine: { a: 0.5, b: 0, c: 0, d: 0, e: 0.5, f: 0 },
      // postAffine: strong X-shear for nebula spread
      postAffine: { a: 1.1, b: 0.25, c: 0, d: -0.05, e: 0.7, f: -0.02 },
      color: { x: 0, y: -0.35 },
      colorSpeed: 0.25,
      variations: {
        [vid('b8c9d0e1_f2a3_027h_4567_234567890abc')]: {
          type: 'sphericalVar',
          weight: 0.6,
        },
        [vid('c9d0e1f2_a3b4_027i_5678_34567890abcd')]: {
          type: 'linearVar',
          weight: 0.4,
        },
      },
    },
  },
})
