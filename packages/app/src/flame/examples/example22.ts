import { defineExample, tid, vid } from './util'

/**
 * Phoenix Ascension — A legendary firebird rises through fractal flames.
 * Butterfly wings shimmer with diamond facets, hearts pulse with flame,
 * tangent wisps curl like smoke, and linearT power-distorts rising sparks
 * into the void.
 */
export const example22 = defineExample({
  renderSettings: {
    exposure: -1.18,
    skipIters: 18,
    drawMode: 'light',
    camera: {
      zoom: 1.1,
      position: [0, -0.05],
    },
  },
  transforms: {
    // T0: Butterfly + diamond — phoenix wing patterns with crystalline facets
    [tid('a1b2c3d4_e5f6_7890_abcd_ef5432109876')]: {
      probability: 0.5,
      preAffine: { a: 0.55, b: -0.1, c: 0, d: 0.1, e: 0.5, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.4, y: 0.1 },
      variations: {
        [vid('b2c3d4e5_f6a7_8901_bcde_f54321098765')]: {
          type: 'butterflyVar',
          weight: 1,
        },
        [vid('c3d4e5f6_a7b8_9012_cdef_43210987654')]: {
          type: 'diamond',
          weight: 0.4,
        },
        [vid('d4e5f6a7_b8c9_0123_defa_32109876543')]: {
          type: 'linear',
          weight: 0.2,
        },
      },
    },
    // T1: Heart + fan + tangent — phoenix body: heart-shaped flame core
    [tid('e5f6a7b8_c9d0_1234_efab_21098765432')]: {
      probability: 0.4,
      preAffine: { a: 0.4, b: 0, c: 0, d: 0, e: 0.45, f: 0.03 },
      postAffine: { a: 0.85, b: 0, c: 0, d: 0, e: 0.85, f: 0 },
      color: { x: 0.1, y: 0.35 },
      variations: {
        [vid('f6a7b8c9_d0e1_2345_fabc_10987654321')]: {
          type: 'heart',
          weight: 1,
        },
        [vid('a7b8c9d0_e1f2_3456_abcd_09876543210')]: {
          type: 'fan',
          weight: 0.35,
        },
        [vid('b8c9d0e1_f2a3_4567_bcde_98765432109')]: {
          type: 'tangentVar',
          weight: 0.2,
        },
      },
    },
    // T2: Scry2 + sinusoidal — flame wisps and smoke tendrils
    [tid('c9d0e1f2_a3b4_5678_cdef_87654321098')]: {
      probability: 0.3,
      preAffine: { a: 0.35, b: 0.08, c: -0.01, d: -0.08, e: 0.35, f: 0.01 },
      postAffine: { a: 0.65, b: -0.1, c: 0, d: 0.1, e: 0.65, f: 0 },
      color: { x: -0.05, y: 0.55 },
      variations: {
        [vid('d0e1f2a3_b4c5_6789_defa_76543210987')]: {
          type: 'scry2Var',
          weight: 1,
          params: { sides: 5, star: 0.3, circle: 0.1 },
        },
        [vid('e1f2a3b4_c5d6_7890_efab_65432109876')]: {
          type: 'sinusoidal',
          weight: 0.3,
        },
      },
    },
    // T3: LinearTVar + gaussian — rising sparks with power distortion
    [tid('f2a3b4c5_d6e7_8901_fabc_54321098765')]: {
      probability: 0.15,
      preAffine: { a: 0.25, b: 0, c: -0.03, d: 0, e: 0.25, f: -0.05 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: -0.15, y: -0.3 },
      variations: {
        [vid('a3b4c5d6_e7f8_9012_abcd_43210987654')]: {
          type: 'linearTVar',
          weight: 0.8,
          params: { powX: 1.5, powY: 0.7 },
        },
        [vid('b4c5d6e7_f8a9_0123_bcde_32109876543')]: {
          type: 'gaussian',
          weight: 0.5,
        },
      },
    },
  },
})
