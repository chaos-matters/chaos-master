import { defineExample, tid, vid } from './util'

/**
 * Radiant Symmetry — D4 dihedral symmetry creates a kaleidoscopic mandala
 * from a single swirl+sinusoidal base transform. The symmetry panel
 * detects the _sym__ prefixed transforms automatically.
 * Rendered in paint mode for luminous glow.
 */
export const example26 = defineExample({
  renderSettings: {
    exposure: 0.25,
    skipIters: 20,
    drawMode: 'paint',
    vibrancy: 0.6,
    contrast: 1.1,
    gamma: 2.2,
    highlightPower: 0.5,
    camera: {
      zoom: 1.0,
      position: [0, 0],
    },
  },
  transforms: {
    // T0: Base transform — swirl + sinusoidal
    [tid('a1b2c3d4_e5f6_026a_7890_abcdef123456')]: {
      probability: 0.5,
      preAffine: { a: 0.8, b: -0.1, c: 0.05, d: 0.1, e: 0.8, f: -0.05 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.4, y: 0.1 },
      colorSpeed: 0.4,
      variations: {
        [vid('b2c3d4e5_f6a7_026b_8901_bcdef1234567')]: {
          type: 'swirl',
          weight: 0.9,
        },
        [vid('c3d4e5f6_a7b8_026c_9012_cdef12345678')]: {
          type: 'sinusoidal',
          weight: 0.35,
        },
      },
    },
    // Symmetry transforms — D4 dihedral (90° rotations + reflection)
    // T1: 90° rotation — detected as symmetry by _sym__ prefix
    ['_sym__rot90_aaaa_cccc_eeee_aaaa_bbbbccccdddd']: {
      visible: true,
      probability: 0.5,
      preAffine: { a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.4, y: 0.1 },
      colorSpeed: 0,
      variations: {
        [vid('d4e5f6a7_b8c9_026d_0123_def123456789')]: {
          type: 'linear',
          weight: 1,
        },
      },
    },
    // T2: 180° rotation
    ['_sym__rot180_bbbb_dddd_ffff_bbbb_ccccddddeeee']: {
      visible: true,
      probability: 0.5,
      preAffine: { a: -1, b: 0, c: 0, d: 0, e: -1, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.4, y: 0.1 },
      colorSpeed: 0,
      variations: {
        [vid('e5f6a7b8_c9d0_026e_1234_ef1234567890')]: {
          type: 'linear',
          weight: 1,
        },
      },
    },
    // T3: 270° rotation
    ['_sym__rot270_cccc_eeee_aaaa_cccc_ddddeeeeffff']: {
      visible: true,
      probability: 0.5,
      preAffine: { a: 0, b: 1, c: 0, d: -1, e: 0, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.4, y: 0.1 },
      colorSpeed: 0,
      variations: {
        [vid('f6a7b8c9_d0e1_026f_2345_01234567890a')]: {
          type: 'linear',
          weight: 1,
        },
      },
    },
    // T4: Reflection — dihedral component
    ['_sym__reflect_dddd_ffff_bbbb_dddd_eeeeffffaaaa']: {
      visible: true,
      probability: 0.5,
      preAffine: { a: -1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.4, y: 0.1 },
      colorSpeed: 0,
      variations: {
        [vid('a7b8c9d0_e1f2_026g_3456_1234567890ab')]: {
          type: 'linear',
          weight: 1,
        },
      },
    },
  },
})
