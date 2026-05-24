import { defineExample, tid, vid } from './util'

/**
 * Neon Basilica — A cyberpunk cathedral woven from sacred geometry.
 * Rectangles form gothic window arches, invEllipse halos surround
 * cross motifs, hexes create stained-glass tessellation, and fan2
 * rose windows radiate neon light.
 */
export const example19 = defineExample({
  renderSettings: {
    exposure: -1.25,
    skipIters: 22,
    drawMode: 'light',
    camera: {
      zoom: 1.2,
      position: [0, 0.03],
    },
  },
  transforms: {
    // T0: Rectangles + arch — gothic window arches with angular pillars
    [tid('a1b2c3d4_e5f6_7890_abcd_ef9876543210')]: {
      probability: 0.5,
      preAffine: { a: 0.55, b: -0.06, c: 0, d: 0.06, e: 0.55, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.15, y: 0.35 },
      variations: {
        [vid('b2c3d4e5_f6a7_8901_bcde_f98765432101')]: {
          type: 'rectanglesVar',
          weight: 1,
          params: { x: 3, y: 5 },
        },
        [vid('c3d4e5f6_a7b8_9012_cdef_87654321012')]: {
          type: 'archVar',
          weight: 0.3,
        },
        [vid('d4e5f6a7_b8c9_0123_defa_76543210123')]: {
          type: 'linear',
          weight: 0.2,
        },
      },
    },
    // T1: InvEllipse + cross + sinusoidal — sacred geometry halos and cross motifs
    [tid('e5f6a7b8_c9d0_1234_efab_65432101234')]: {
      probability: 0.35,
      preAffine: { a: 0.45, b: 0.1, c: -0.02, d: -0.1, e: 0.45, f: 0.02 },
      postAffine: { a: 0.75, b: -0.2, c: 0, d: 0.2, e: 0.75, f: 0 },
      color: { x: -0.2, y: 0.15 },
      variations: {
        [vid('f6a7b8c9_d0e1_2345_fabc_54321012345')]: {
          type: 'invEllipse',
          weight: 1,
          params: { a: 0.7, b: 0.5, h: 0, k: 0, restricted: 0 },
        },
        [vid('a7b8c9d0_e1f2_3456_abcd_43210123456')]: {
          type: 'crossVar',
          weight: 0.4,
        },
        [vid('b8c9d0e1_f2a3_4567_bcde_32101234567')]: {
          type: 'sinusoidal',
          weight: 0.2,
        },
      },
    },
    // T2: Hexes + squarize — stained glass hexagonal tessellation
    [tid('c9d0e1f2_a3b4_5678_cdef_21012345678')]: {
      probability: 0.25,
      preAffine: { a: 0.4, b: 0, c: 0.01, d: 0, e: 0.4, f: -0.01 },
      postAffine: { a: 0.7, b: 0, c: 0, d: 0, e: 0.7, f: 0 },
      color: { x: 0.25, y: -0.15 },
      variations: {
        [vid('d0e1f2a3_b4c5_6789_defa_10123456789')]: {
          type: 'hexesVar',
          weight: 1,
          params: { cellsize: 0.1, power: 1.0, rotate: 0.3, scale: 0.7 },
        },
        [vid('e1f2a3b4_c5d6_7890_efab_01234567890')]: {
          type: 'squarizeVar',
          weight: 0.3,
        },
      },
    },
    // T3: Fan2 + heart — rose window with radiating neon light
    [tid('f2a3b4c5_d6e7_8901_fabc_98765432109')]: {
      probability: 0.15,
      preAffine: { a: 0.3, b: 0, c: 0, d: 0, e: 0.3, f: 0 },
      postAffine: { a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 },
      color: { x: 0.05, y: 0.45 },
      variations: {
        [vid('a3b4c5d6_e7f8_9012_abcd_87654321090')]: {
          type: 'fan2',
          weight: 1,
          params: { x: 0.8, y: 0.6 },
        },
        [vid('b4c5d6e7_f8a9_0123_bcde_76543210901')]: {
          type: 'heart',
          weight: 0.35,
        },
        [vid('c5d6e7f8_a9b0_1234_cdef_65432109012')]: {
          type: 'linear',
          weight: 0.15,
        },
      },
    },
  },
})
