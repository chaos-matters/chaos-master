import { defineExample, tid, vid } from './util'

/**
 * Void Weave — dark, delicate web-like patterns with diamond+spiral
 * geometry, juliaN fractal threads, and bent distortions.
 */
export const example11 = defineExample({
  renderSettings: {
    exposure: -1.3,
    skipIters: 20,
    drawMode: 'light',
    camera: {
      zoom: 1.3,
      position: [0, 0],
    },
  },
  transforms: {
    // T0: Diamond + spiral + linear — intricate geometric web with spiral twist
    [tid('a5b6c7d8_e9f0_1234_5678_90abcdef0567')]: {
      probability: 0.6,
      preAffine: { a: 0.65, b: 0.1, c: 0, d: -0.05, e: 0.6, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.05, y: 0.3 },
      variations: {
        [vid('b5c6d7e8_f9a0_1234_6789_0abcdef05678')]: {
          type: 'diamond',
          weight: 1,
        },
        [vid('c5d6e7f8_a9b0_1234_7890_abcdef056789')]: {
          type: 'spiral',
          weight: 0.5,
        },
        [vid('d5e6f7a8_b9c0_1234_8901_bcdef0567890')]: {
          type: 'linear',
          weight: 0.3,
        },
      },
    },
    // T1: JuliaN + horseshoe — julia threads with horseshoe warping
    [tid('e5f6a7b8_c9d0_1234_9012_cdef05678901')]: {
      probability: 0.3,
      preAffine: { a: 0.4, b: -0.15, c: 0.05, d: 0.15, e: 0.4, f: -0.05 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: -0.25, y: 0.1 },
      variations: {
        [vid('f5a6b7c8_d9e0_1234_0123_def056789012')]: {
          type: 'juliaN',
          weight: 1,
          params: { power: 6, dist: 2 },
        },
        [vid('a6b7c8d9_e0f1_2345_6789_0abcdef05601')]: {
          type: 'horseshoe',
          weight: 0.35,
        },
        [vid('b6c7d8e9_f0a1_2345_7890_abcdef056012')]: {
          type: 'linear',
          weight: 0.2,
        },
      },
    },
    // T2: Bent + juliaScope — sharp bent patterns with depth
    [tid('c6d7e8f9_a0b1_2345_8901_bcdef0560123')]: {
      probability: 0.25,
      preAffine: { a: 0.3, b: 0, c: -0.02, d: 0, e: 0.3, f: 0.02 },
      postAffine: { a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 },
      color: { x: 0.1, y: -0.2 },
      variations: {
        [vid('d6e7f8a9_b0c1_2345_9012_cdef05601234')]: {
          type: 'bent',
          weight: 0.6,
        },
        [vid('e6f7a8b9_c0d1_2345_0123_def056012345')]: {
          type: 'juliaScope',
          weight: 1,
          params: { power: 2, dist: 3 },
        },
        [vid('f6a7b8c9_d0e1_2345_1234_ef0560123456')]: {
          type: 'linear',
          weight: 0.3,
        },
      },
    },
  },
})
