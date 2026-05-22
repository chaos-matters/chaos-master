import { defineExample, tid, vid } from './util'

/**
 * Crystal Genesis — geometric lattice blooming into fractal structures.
 * Grid creates the crystalline base, fan2 adds angular fan patterns,
 * and juliaN injects fractal complexity.
 */
export const example9 = defineExample({
  renderSettings: {
    exposure: 0.25,
    skipIters: 20,
    drawMode: 'light',
    camera: {
      zoom: 1.4,
      position: [0, 0],
    },
  },
  transforms: {
    // T0: Grid + linear — creates the crystal lattice structure
    [tid('e2f3a4b5_c6d7_8901_2345_67890abcdef2')]: {
      probability: 0.6,
      preAffine: { a: 0.7, b: 0, c: 0, d: 0, e: 0.7, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.1, y: 0.25 },
      variations: {
        [vid('f2a3b4c5_d6e7_8901_3456_7890abcdef23')]: {
          type: 'grid',
          weight: 1,
          params: {
            divisions: 8,
            size: 1,
            jitterNearIntersectionsDistance: 0.003,
          },
        },
        [vid('a2b3c4d5_e6f7_8901_4567_890abcdef234')]: {
          type: 'linear',
          weight: 0.5,
        },
      },
    },
    // T1: Fan2 + popcorn — fan-distorted angular patterns with popcorn texture
    [tid('b2c3d4e5_f6a7_8901_5678_90abcdef2345')]: {
      probability: 0.35,
      preAffine: { a: 0.5, b: 0.2, c: 0.15, d: -0.15, e: 0.5, f: -0.1 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: -0.15, y: 0.05 },
      variations: {
        [vid('c2d3e4f5_a6b7_8901_6789_0abcdef23456')]: {
          type: 'fan2',
          weight: 0.8,
          params: { x: 0.7, y: 0.5 },
        },
        [vid('d2e3f4a5_b6c7_8901_7890_abcdef234567')]: {
          type: 'popcorn',
          weight: 0.2,
        },
        [vid('e2f3a4b5_c6d7_8901_8901_bcdef2345678')]: {
          type: 'linear',
          weight: 0.3,
        },
      },
    },
    // T2: JuliaN + eyefish — fractal center with fish-eye lens warp
    [tid('f2a3b4c5_d6e7_8901_9012_cdef23456789')]: {
      probability: 0.15,
      preAffine: { a: 0.3, b: 0, c: 0, d: 0, e: 0.3, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0, y: -0.35 },
      variations: {
        [vid('a3b4c5d6_e7f8_9012_3456_7890abcdef01')]: {
          type: 'juliaN',
          weight: 1,
          params: { power: 4, dist: 3 },
        },
        [vid('b3c4d5e6_f7a8_9012_4567_890abcdef012')]: {
          type: 'eyefish',
          weight: 0.15,
        },
      },
    },
  },
})
