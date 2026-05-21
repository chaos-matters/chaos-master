import { defineExample, tid, vid } from './util'

/**
 * Cosmic Swirl — Spiral nebula arms emerge from fan2 radial segments warped
 * by swirl3Var logarithmic spirals. Julian fractal depth and curl distortion
 * create galactic dust lanes with rich color separation.
 */
export const example23 = defineExample({
  renderSettings: {
    exposure: 0.22,
    skipIters: 20,
    drawMode: 'light',
    vibrancy: 0.65,
    contrast: 1.15,
    highlightPower: 0.55,
    camera: {
      zoom: 1.0,
      position: [0, 0],
    },
  },
  transforms: {
    // T0: Fan2 + swirl3Var — radial fan segments twisted into logarithmic spirals
    [tid('a1b2c3d4_e5f6_018a_7890_abcdef123456')]: {
      probability: 0.5,
      preAffine: { a: 0.55, b: 0, c: 0, d: 0, e: 0.55, f: 0 },
      postAffine: { a: 0.9, b: -0.15, c: 0, d: 0.15, e: 0.9, f: 0 },
      color: { x: 0.35, y: 0.1 },
      variations: {
        [vid('b2c3d4e5_f6a7_018b_8901_bcdef1234567')]: {
          type: 'fan2',
          weight: 1,
          params: { x: 0.7, y: 0.75 },
        },
        [vid('c3d4e5f6_a7b8_018c_9012_cdef12345678')]: {
          type: 'swirl3Var',
          weight: 0.5,
          params: { shift: 4.5 },
        },
      },
    },
    // T1: JuliaScope + curlVar — fractal depth core with curl distortion
    [tid('d4e5f6a7_b8c9_018d_0123_def123456789')]: {
      probability: 0.35,
      preAffine: { a: 0.35, b: 0.08, c: -0.03, d: -0.08, e: 0.35, f: 0.03 },
      postAffine: { a: 0.75, b: -0.2, c: 0, d: 0.2, e: 0.75, f: 0 },
      color: { x: -0.1, y: -0.2 },
      variations: {
        [vid('e5f6a7b8_c9d0_018e_1234_ef1234567890')]: {
          type: 'juliaScope',
          weight: 1,
          params: { power: 4, dist: 3 },
        },
        [vid('f6a7b8c9_d0e1_018f_2345_01234567890a')]: {
          type: 'curlVar',
          weight: 0.3,
          params: { c1: 1.2, c2: 4 },
        },
      },
    },
    // T2: Horseshoe + swirl — warp field that pulls arms into curved distortion
    [tid('a7b8c9d0_e1f2_018g_3456_1234567890ab')]: {
      probability: 0.25,
      preAffine: { a: 0.3, b: 0, c: 0, d: 0, e: 0.3, f: 0 },
      postAffine: { a: 0, b: -0.8, c: 0, d: 0.8, e: 0, f: 0 },
      color: { x: 0, y: -0.35 },
      variations: {
        [vid('b8c9d0e1_f2a3_018h_4567_234567890abc')]: {
          type: 'horseshoe',
          weight: 0.85,
        },
        [vid('c9d0e1f2_a3b4_018i_5678_34567890abcd')]: {
          type: 'swirl',
          weight: 0.2,
        },
      },
    },
  },
})
