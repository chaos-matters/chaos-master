import { defineExample, tid, vid } from './util'

/**
 * Abyssal Bloom — Bioluminescent deep-sea organisms drift through
 * an oceanic dreamscape. Blob bodies pulse with organic life, bubble
 * chains rise through circus spirals, waves undulate like coral fronds,
 * and swirl3 vortexes coil into the abyss.
 */
export const example20 = defineExample({
  renderSettings: {
    exposure: 0.22,
    skipIters: 20,
    drawMode: 'light',
    camera: {
      zoom: 1.15,
      position: [0.01, -0.04],
    },
  },
  transforms: {
    // T0: Blob + fan2 — organic bodies with fan-like membranous edges
    [tid('a1b2c3d4_e5f6_7890_abcd_ef0123456789')]: {
      probability: 0.5,
      preAffine: { a: 0.5, b: -0.05, c: 0, d: 0.05, e: 0.5, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.1, y: 0.3 },
      variations: {
        [vid('b2c3d4e5_f6a7_8901_bcde_f01234567890')]: {
          type: 'blob',
          weight: 1,
          params: { high: 2.5, low: 1.2, waves: 3 },
        },
        [vid('c3d4e5f6_a7b8_9012_cdef_012345678901')]: {
          type: 'fan2',
          weight: 0.35,
          params: { x: 0.9, y: 0.7 },
        },
      },
    },
    // T1: Bubble + circus + sinusoidal — bubble chains in circular dance
    [tid('d4e5f6a7_b8c9_0123_defa_bc3456789012')]: {
      probability: 0.4,
      preAffine: { a: 0.4, b: 0.08, c: -0.02, d: -0.08, e: 0.4, f: 0.02 },
      postAffine: { a: 0.8, b: 0, c: 0, d: 0, e: 0.8, f: 0 },
      color: { x: -0.15, y: 0.1 },
      variations: {
        [vid('e5f6a7b8_c9d0_1234_efab_cd4567890123')]: {
          type: 'bubble',
          weight: 1,
        },
        [vid('f6a7b8c9_d0e1_2345_fabc_de5678901234')]: {
          type: 'circus',
          weight: 0.5,
          params: { scale: 0.85 },
        },
        [vid('a7b8c9d0_e1f2_3456_abcd_ef6789012345')]: {
          type: 'sinusoidal',
          weight: 0.3,
        },
      },
    },
    // T2: Waves + swirl3 — undulating coral fronds with spiral vortex
    [tid('b8c9d0e1_f2a3_4567_bcde_f89012345678')]: {
      probability: 0.3,
      preAffine: { a: 0.4, b: 0.1, c: 0.02, d: -0.1, e: 0.4, f: -0.02 },
      postAffine: { a: 0.7, b: -0.1, c: 0, d: 0.1, e: 0.7, f: 0 },
      color: { x: 0.2, y: -0.1 },
      variations: {
        [vid('c9d0e1f2_a3b4_5678_cdef_901234567890')]: {
          type: 'waves',
          weight: 1,
        },
        [vid('d0e1f2a3_b4c5_6789_defa_012345678901')]: {
          type: 'swirl3Var',
          weight: 0.45,
          params: { shift: 7 },
        },
      },
    },
    // T3: Horseshoe + popcorn2 — curled deep-sea tendrils with clustered texture
    [tid('e1f2a3b4_c5d6_7890_efab_123456789012')]: {
      probability: 0.2,
      preAffine: { a: 0.3, b: 0, c: -0.02, d: 0, e: 0.3, f: 0.02 },
      postAffine: { a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 },
      color: { x: 0.05, y: -0.3 },
      variations: {
        [vid('f2a3b4c5_d6e7_8901_fabc_234567890123')]: {
          type: 'horseshoe',
          weight: 0.7,
        },
        [vid('a3b4c5d6_e7f8_9012_abcd_345678901234')]: {
          type: 'popcorn2Var',
          weight: 0.5,
          params: { x: 1.2, y: 0.6, c: 1.8 },
        },
        [vid('b4c5d6e7_f8a9_0123_bcde_456789012345')]: {
          type: 'linear',
          weight: 0.2,
        },
      },
    },
  },
})
