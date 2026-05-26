import { defineExample, tid, vid } from './util'

/**
 * Symmetry Cascade — D3 (120°) rotational symmetry applied over two base
 * transforms, each with its own distinctive postAffine shaping. The symmetry
 * multiplies this into a hexagonal kaleidoscope. Animate postAffine
 * coefficients to watch the cascade reshape itself.
 * Rendered in paint mode for rich color blending.
 */
export const example29 = defineExample({
  renderSettings: {
    exposure: 0.22,
    skipIters: 20,
    drawMode: 'paint',
    vibrancy: 0.65,
    contrast: 1.05,
    gamma: 2.2,
    highlightPower: 0.45,
    camera: {
      zoom: 1.0,
      position: [0, 0],
    },
  },
  transforms: {
    // T0: Primary lobe — swirl with postAffine stretch
    [tid('a1b2c3d4_e5f6_029a_7890_abcdef123456')]: {
      probability: 0.4,
      preAffine: { a: 0.85, b: -0.05, c: 0.08, d: 0.05, e: 0.85, f: 0 },
      // postAffine: subtle Y-stretch for elongated petal shape
      postAffine: { a: 0.9, b: 0, c: 0, d: 0, e: 1.2, f: 0 },
      color: { x: 0.55, y: 0.15 },
      colorSpeed: 0.35,
      variations: {
        [vid('b2c3d4e5_f6a7_029b_8901_bcdef1234567')]: {
          type: 'swirl',
          weight: 0.85,
        },
        [vid('c3d4e5f6_a7b8_029c_9012_cdef12345678')]: {
          type: 'sinusoidal',
          weight: 0.3,
        },
      },
    },
    // T1: Secondary lobe — hyperbolic with different postAffine
    [tid('d4e5f6a7_b8c9_029d_0123_def123456789')]: {
      probability: 0.35,
      preAffine: { a: 0.55, b: 0.1, c: 0, d: -0.12, e: 0.55, f: -0.05 },
      // postAffine: compression + slight shear for contrast with T0
      postAffine: { a: 0.7, b: -0.2, c: 0, d: 0.1, e: 0.75, f: 0 },
      color: { x: -0.15, y: -0.3 },
      colorSpeed: 0.3,
      variations: {
        [vid('e5f6a7b8_c9d0_029e_1234_ef1234567890')]: {
          type: 'hyperbolic',
          weight: 0.75,
        },
        [vid('f6a7b8c9_d0e1_029f_2345_01234567890a')]: {
          type: 'linear',
          weight: 0.4,
        },
      },
    },
    // T2: Center fill — spherical blob with identity postAffine
    [tid('a7b8c9d0_e1f2_029g_3456_1234567890ab')]: {
      probability: 0.25,
      preAffine: { a: 0.45, b: 0, c: 0, d: 0, e: 0.45, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0, y: -0.5 },
      colorSpeed: 0.2,
      variations: {
        [vid('b8c9d0e1_f2a3_029h_4567_234567890abc')]: {
          type: 'spherical',
          weight: 1,
        },
      },
    },
    // D3 Symmetry transforms (120° rotations + reflection)
    // T3: 120° rotation — detected by _sym__ prefix
    ['_sym__rot120_d3_e5f6_aaaa_bbbb_120rot_d3abcd']: {
      visible: true,
      probability: 0.4,
      preAffine: { a: -0.5, b: -0.866, c: 0, d: 0.866, e: -0.5, f: 0 },
      postAffine: { a: 0.9, b: 0, c: 0, d: 0, e: 1.2, f: 0 },
      color: { x: 0.55, y: 0.15 },
      colorSpeed: 0,
      variations: {
        [vid('c9d0e1f2_a3b4_029i_5678_34567890abcd')]: {
          type: 'linear',
          weight: 1,
        },
      },
    },
    // T4: 240° rotation
    ['_sym__rot240_d3_f6a7_bbbb_cccc_240rot_d3bcde']: {
      visible: true,
      probability: 0.4,
      preAffine: { a: -0.5, b: 0.866, c: 0, d: -0.866, e: -0.5, f: 0 },
      postAffine: { a: 0.9, b: 0, c: 0, d: 0, e: 1.2, f: 0 },
      color: { x: 0.55, y: 0.15 },
      colorSpeed: 0,
      variations: {
        [vid('d0e1f2a3_b4c5_029j_6789_4567890abcde')]: {
          type: 'linear',
          weight: 1,
        },
      },
    },
    // T5: 120° rotation of T1
    ['_sym__rot120_t1_e5_a7b8_cccc_dddd_120rt1_d3cdef']: {
      visible: true,
      probability: 0.35,
      preAffine: { a: -0.5, b: -0.866, c: 0, d: 0.866, e: -0.5, f: 0 },
      postAffine: { a: 0.7, b: -0.2, c: 0, d: 0.1, e: 0.75, f: 0 },
      color: { x: -0.15, y: -0.3 },
      colorSpeed: 0,
      variations: {
        [vid('e1f2a3b4_c5d6_029k_7890_567890abcdef')]: {
          type: 'linear',
          weight: 1,
        },
      },
    },
    // T6: 240° rotation of T1
    ['_sym__rot240_t1_f6_b8c9_dddd_eeee_240rt1_d3def0']: {
      visible: true,
      probability: 0.35,
      preAffine: { a: -0.5, b: 0.866, c: 0, d: -0.866, e: -0.5, f: 0 },
      postAffine: { a: 0.7, b: -0.2, c: 0, d: 0.1, e: 0.75, f: 0 },
      color: { x: -0.15, y: -0.3 },
      colorSpeed: 0,
      variations: {
        [vid('f2a3b4c5_d6e7_029l_890a_678901abcdef')]: {
          type: 'linear',
          weight: 1,
        },
      },
    },
    // T7: Reflection — dihedral component
    ['_sym__reflect_d3_a7_c9d0_eeee_ffff_refl_d3ef01']: {
      visible: true,
      probability: 0.4,
      preAffine: { a: -1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      postAffine: { a: 0.9, b: 0, c: 0, d: 0, e: 1.2, f: 0 },
      color: { x: 0.55, y: 0.15 },
      colorSpeed: 0,
      variations: {
        [vid('a3b4c5d6_e7f8_029m_90ab_789012abcdef')]: {
          type: 'linear',
          weight: 1,
        },
      },
    },
  },
})
