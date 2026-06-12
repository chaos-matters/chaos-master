import { defineExample, tid, vid } from './util'

/**
 * Nebula Ghost — Clifford attractor weaves ethereal nebula clouds,
 * PDJ creates ghostly parametric distortions, curl adds spiral vortices.
 */
export const example13 = defineExample({
  version: '1.0',
  metadata: {
    author: 'unknown',
    name: 'Nebula Ghost',
    description:
      'Clifford attractor weaves ethereal nebula clouds, PDJ creates ghostly parametric distortions, curl adds spiral vortices.',
  },
  renderSettings: {
    exposure: 0.32,
    skipIters: 20,
    drawMode: 'light',
    camera: {
      zoom: 1.2,
      position: [0, 0],
    },
  },
  transforms: {
    // T0: Clifford attractor + curl — nebula-like cloud with spiral vortex
    [tid('a1b2c3d4_e5f6_7890_1234_567890abcdef')]: {
      probability: 0.55,
      preAffine: { a: 0.5, b: -0.05, c: 0.02, d: 0.05, e: 0.5, f: -0.02 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.25, y: 0.15 },
      variations: {
        [vid('b2c3d4e5_f6a7_8901_2345_678901abcdef')]: {
          type: 'cliffordVar',
          weight: 1,
          params: { a: -1.4, b: 1.6, c: 1.0, d: 0.7 },
        },
        [vid('c3d4e5f6_a7b8_9012_3456_789012abcdef')]: {
          type: 'curlVar',
          weight: 0.3,
          params: { c1: 1, c2: 1 },
        },
      },
    },
    // T1: PDJ + sinusoidal — ghostly parametric wave distortions
    [tid('d4e5f6a7_b8c9_0123_4567_890123abcdef')]: {
      probability: 0.4,
      preAffine: { a: 0.4, b: 0.1, c: -0.03, d: -0.1, e: 0.4, f: 0.03 },
      postAffine: { a: 0.7, b: -0.3, c: 0, d: 0.3, e: 0.7, f: 0 },
      color: { x: -0.1, y: -0.2 },
      variations: {
        [vid('e5f6a7b8_c9d0_1234_5678_901234abcdef')]: {
          type: 'pdjVar',
          weight: 1,
          params: { a: 1, b: 2, c: 3, d: 4 },
        },
        [vid('f6a7b8c9_d0e1_2345_6789_012345abcdef')]: {
          type: 'sinusoidalVar',
          weight: 0.35,
        },
      },
    },
    // T2: Gaussian + linear — interstellar dust particles
    [tid('a7b8c9d0_e1f2_3456_7890_123456abcdef')]: {
      probability: 0.3,
      preAffine: { a: 0.3, b: 0, c: 0, d: 0, e: 0.3, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0, y: -0.3 },
      variations: {
        [vid('b8c9d0e1_f2a3_4567_8901_234567abcdef')]: {
          type: 'gaussianVar',
          weight: 0.8,
        },
        [vid('c9d0e1f2_a3b4_5678_9012_345678abcdef')]: {
          type: 'linearVar',
          weight: 0.2,
        },
      },
    },
  },
})
