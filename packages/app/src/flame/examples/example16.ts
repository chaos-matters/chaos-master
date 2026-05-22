import { defineExample, tid, vid } from './util'

/**
 * Phantom Lattice — Organic blobs drift across a hexagonal lattice while
 * n-gon shapes crystallize into geometric mandalas, all warped by
 * juliaScope fractal depth.
 */
export const example16 = defineExample({
  renderSettings: {
    exposure: 0.25,
    skipIters: 20,
    drawMode: 'light',
    camera: {
      zoom: 1.05,
      position: [0, 0],
    },
  },
  transforms: {
    // T0: Blob + hexes — organic blobs floating on hexagonal lattice
    [tid('a1b2c3d4_e5f6_0123_7890_abcdef123456')]: {
      probability: 0.5,
      preAffine: { a: 0.5, b: 0, c: 0, d: 0, e: 0.5, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.2, y: 0.1 },
      variations: {
        [vid('b2c3d4e5_f6a7_0123_8901_bcdef1234567')]: {
          type: 'blob',
          weight: 1,
          params: { high: 2, low: 1, waves: 1 },
        },
        [vid('c3d4e5f6_a7b8_0123_9012_cdef12345678')]: {
          type: 'hexesVar',
          weight: 0.35,
          params: { cellsize: 0.12, power: 1.2, rotate: 0.3, scale: 0.65 },
        },
      },
    },
    // T1: N-gon + spherical — geometric polygons projected spherically
    [tid('d4e5f6a7_b8c9_0123_0123_def123456789')]: {
      probability: 0.4,
      preAffine: { a: 0.4, b: 0.12, c: -0.02, d: -0.12, e: 0.4, f: 0.02 },
      postAffine: { a: 0.75, b: -0.2, c: 0, d: 0.2, e: 0.75, f: 0 },
      color: { x: -0.05, y: -0.2 },
      variations: {
        [vid('e5f6a7b8_c9d0_0123_1234_ef1234567890')]: {
          type: 'ngonVar',
          weight: 1,
          params: { power: 2, sides: 3, corners: 4, circle: 4 },
        },
        [vid('f6a7b8c9_d0e1_0123_2345_01234567890a')]: {
          type: 'spherical',
          weight: 0.35,
        },
        [vid('a7b8c9d0_e1f2_0123_3456_1234567890ab')]: {
          type: 'horseshoe',
          weight: 0.15,
        },
      },
    },
    // T2: JuliaScope + eyefish — fractal depth core
    [tid('b8c9d0e1_f2a3_0123_4567_234567890abc')]: {
      probability: 0.25,
      preAffine: { a: 0.3, b: 0, c: 0, d: 0, e: 0.3, f: 0 },
      postAffine: { a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 },
      color: { x: 0, y: -0.3 },
      variations: {
        [vid('c9d0e1f2_a3b4_0123_5678_34567890abcd')]: {
          type: 'juliaScope',
          weight: 1,
          params: { power: 3.5, dist: 2.8 },
        },
        [vid('d0e1f2a3_b4c5_0123_6789_4567890abcde')]: {
          type: 'eyefish',
          weight: 0.25,
        },
      },
    },
  },
})
