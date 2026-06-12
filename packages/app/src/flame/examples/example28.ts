import { defineExample, tid, vid } from './util'

/**
 * Final Lens — Two simple transforms produce a heart-shaped pattern, and the
 * descriptor-level finalTransform applies a global stretch+shear that bends
 * the entire rendered result like a lens. Animate finalTransform coefficients
 * to create dynamic warping effects.
 * Rendered in light mode for crisp contrast.
 */
export const example28 = defineExample({
  renderSettings: {
    exposure: 0.35,
    skipIters: 20,
    drawMode: 'light',
    vibrancy: 0.5,
    contrast: 1.0,
    gamma: 2.0,
    highlightPower: 0.4,
    camera: {
      zoom: 1.2,
      position: [0, 0],
    },
  },
  finalTransform: { a: 0.85, b: 0.2, c: 0, d: -0.15, e: 1.1, f: 0 },
  transforms: {
    // T0: Heart base — sinusoidal creates lobe shapes
    [tid('a1b2c3d4_e5f6_028a_7890_abcdef123456')]: {
      probability: 0.55,
      preAffine: { a: 0.65, b: 0, c: 0, d: 0, e: 0.65, f: 0.15 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.6, y: 0.3 },
      colorSpeed: 0.35,
      variations: {
        [vid('b2c3d4e5_f6a7_028b_8901_bcdef1234567')]: {
          type: 'sinusoidalVar',
          weight: 1,
        },
        [vid('c3d4e5f6_a7b8_028c_9012_cdef12345678')]: {
          type: 'sphericalVar',
          weight: 0.3,
        },
      },
    },
    // T1: Fill + swirl — adds depth and texture
    [tid('d4e5f6a7_b8c9_028d_0123_def123456789')]: {
      probability: 0.45,
      preAffine: { a: 0.5, b: 0.1, c: -0.02, d: -0.08, e: 0.5, f: 0.05 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: -0.3, y: -0.2 },
      colorSpeed: 0.3,
      variations: {
        [vid('e5f6a7b8_c9d0_028e_1234_ef1234567890')]: {
          type: 'swirlVar',
          weight: 0.7,
        },
        [vid('f6a7b8c9_d0e1_028f_2345_01234567890a')]: {
          type: 'linearVar',
          weight: 0.5,
        },
      },
    },
  },
})
