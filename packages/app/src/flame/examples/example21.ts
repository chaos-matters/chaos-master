import { defineExample, tid, vid } from './util'

/**
 * Cyber Mandala — Intricate geometric mandala radiating from a central
 * n-gon polygon through star-burst halos, parametric distortion rings,
 * and a juliaN fractal outer edge. Sacred geometry meets cyberpunk.
 */
export const example21 = defineExample({
  renderSettings: {
    exposure: -1.22,
    skipIters: 20,
    drawMode: 'light',
    camera: {
      zoom: 1.25,
      position: [0, 0],
    },
  },
  transforms: {
    // T0: N-gon + squish — central mandala polygon with power distortion
    [tid('a1b2c3d4_e5f6_7890_abcd_ef2109876543')]: {
      probability: 0.5,
      preAffine: { a: 0.6, b: 0, c: 0, d: 0, e: 0.6, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.15, y: 0.3 },
      variations: {
        [vid('b2c3d4e5_f6a7_8901_bcde_f21098765432')]: {
          type: 'ngonVar',
          weight: 1,
          params: { power: 3, sides: 6, corners: 5, circle: 2 },
        },
        [vid('c3d4e5f6_a7b8_9012_cdef_10987654321')]: {
          type: 'squishVar',
          weight: 0.35,
          params: { power: 1.5 },
        },
      },
    },
    // T1: StarBlur + radialBlur — radiating starburst halo
    [tid('d4e5f6a7_b8c9_0123_defa_09876543210')]: {
      probability: 0.4,
      preAffine: { a: 0.5, b: 0.08, c: 0, d: -0.08, e: 0.5, f: 0 },
      postAffine: { a: 0.85, b: 0, c: 0, d: 0, e: 0.85, f: 0 },
      color: { x: -0.2, y: 0.05 },
      variations: {
        [vid('e5f6a7b8_c9d0_1234_efab_98765432109')]: {
          type: 'starBlurVar',
          weight: 1,
          params: { power: 4, range: 0.4 },
        },
        [vid('f6a7b8c9_d0e1_2345_fabc_87654321098')]: {
          type: 'radialBlurVar',
          weight: 0.4,
          params: { angle: Math.PI * 0.5 },
        },
        [vid('a7b8c9d0_e1f2_3456_abcd_76543210987')]: {
          type: 'linear',
          weight: 0.2,
        },
      },
    },
    // T2: PDJ + diamond + rings2 — parametric distortion with concentric rings
    [tid('b8c9d0e1_f2a3_4567_bcde_65432109876')]: {
      probability: 0.3,
      preAffine: { a: 0.4, b: 0.05, c: -0.02, d: -0.05, e: 0.4, f: 0.02 },
      postAffine: { a: 0.7, b: -0.1, c: 0, d: 0.1, e: 0.7, f: 0 },
      color: { x: 0.25, y: -0.1 },
      variations: {
        [vid('c9d0e1f2_a3b4_5678_cdef_54321098765')]: {
          type: 'pdjVar',
          weight: 1,
          params: { a: 0.8, b: 1.5, c: -0.5, d: 2.0 },
        },
        [vid('d0e1f2a3_b4c5_6789_defa_43210987654')]: {
          type: 'diamond',
          weight: 0.5,
        },
        [vid('e1f2a3b4_c5d6_7890_efab_32109876543')]: {
          type: 'rings2',
          weight: 0.3,
          params: { val: 5 },
        },
      },
    },
    // T3: JuliaN + fan — fractal outer mandala ring with angular fan
    [tid('f2a3b4c5_d6e7_8901_fabc_21098765432')]: {
      probability: 0.2,
      preAffine: { a: 0.3, b: 0, c: 0, d: 0, e: 0.3, f: 0 },
      postAffine: { a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 },
      color: { x: 0, y: -0.35 },
      variations: {
        [vid('a3b4c5d6_e7f8_9012_abcd_10987654321')]: {
          type: 'juliaN',
          weight: 1,
          params: { power: 5, dist: 3.5 },
        },
        [vid('b4c5d6e7_f8a9_0123_bcde_09876543210')]: {
          type: 'fan',
          weight: 0.3,
        },
        [vid('c5d6e7f8_a9b0_1234_cdef_98765432109')]: {
          type: 'linear',
          weight: 0.15,
        },
      },
    },
  },
})
