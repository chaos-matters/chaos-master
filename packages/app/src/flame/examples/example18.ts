import { defineExample, tid, vid } from './util'

/**
 * Quantum Singularity — A gravitational vortex spiraling into a fractal
 * event horizon. Tunnel depth warps spacetime while curlVar quantum spin
 * and juliaScope fractal tendrils create relativistic light-bending.
 */
export const example18 = defineExample({
  renderSettings: {
    exposure: 0.28,
    skipIters: 25,
    drawMode: 'light',
    camera: {
      zoom: 1.3,
      position: [0.03, -0.02],
    },
  },
  transforms: {
    // T0: Tunnel + hyperbolic — gravitational well with relativistic shear
    [tid('a1b2c3d4_e5f6_7890_abcd_ef1234567890')]: {
      probability: 0.55,
      preAffine: { a: 0.55, b: -0.08, c: 0, d: 0.08, e: 0.55, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.35, y: 0.1 },
      variations: {
        [vid('b2c3d4e5_f6a7_8901_bcde_f12345678901')]: {
          type: 'tunnelVar',
          weight: 1,
          params: { Sx: 200, Sy: 50 },
        },
        [vid('c3d4e5f6_a7b8_9012_cdef_123456789012')]: {
          type: 'hyperbolic',
          weight: 0.25,
        },
      },
    },
    // T1: Curl + spiral — quantum spin vortex with spiral arms
    [tid('d4e5f6a7_b8c9_0123_defa_bc4567890123')]: {
      probability: 0.4,
      preAffine: { a: 0.45, b: 0.12, c: -0.03, d: -0.12, e: 0.45, f: 0.03 },
      postAffine: { a: 0.8, b: -0.15, c: 0, d: 0.15, e: 0.8, f: 0 },
      color: { x: -0.15, y: 0.2 },
      variations: {
        [vid('e5f6a7b8_c9d0_1234_efab_cd5678901234')]: {
          type: 'curlVar',
          weight: 1,
          params: { c1: 1.2, c2: 0.8 },
        },
        [vid('f6a7b8c9_d0e1_2345_fabc_de6789012345')]: {
          type: 'spiral',
          weight: 0.35,
        },
        [vid('a7b8c9d0_e1f2_3456_abcd_ef7890123456')]: {
          type: 'linear',
          weight: 0.2,
        },
      },
    },
    // T2: JuliaScope + swirl — fractal event horizon with swirl distortion
    [tid('b8c9d0e1_f2a3_4567_bcde_f89012345678')]: {
      probability: 0.3,
      preAffine: { a: 0.3, b: 0, c: 0, d: 0, e: 0.3, f: 0 },
      postAffine: { a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 },
      color: { x: 0.05, y: -0.3 },
      variations: {
        [vid('c9d0e1f2_a3b4_5678_cdef_901234567890')]: {
          type: 'juliaScope',
          weight: 1,
          params: { power: 4, dist: 2.5 },
        },
        [vid('d0e1f2a3_b4c5_6789_defa_012345678901')]: {
          type: 'swirl',
          weight: 0.3,
        },
      },
    },
    // T3: Gaussian + rings — accretion disk sparkles with concentric rings
    [tid('e1f2a3b4_c5d6_7890_efab_123456789012')]: {
      probability: 0.2,
      preAffine: { a: 0.35, b: 0, c: 0.02, d: 0, e: 0.35, f: -0.02 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: -0.1, y: -0.15 },
      variations: {
        [vid('f2a3b4c5_d6e7_8901_fabc_234567890123')]: {
          type: 'gaussian',
          weight: 1,
        },
        [vid('a3b4c5d6_e7f8_9012_abcd_345678901234')]: {
          type: 'rings',
          weight: 0.4,
        },
      },
    },
  },
})
