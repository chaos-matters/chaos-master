import { defineExample, tid, vid } from './util'

/**
 * Benchmark Flame — standardized, demanding, deterministic.
 * 6 transforms with 2-3 variations each + finalTransform.
 * Exercised in the BenchmarkModal for 10 seconds to measure BPS.
 */
export const benchmark = defineExample({
  renderSettings: {
    exposure: 0.3,
    skipIters: 20,
    drawMode: 'light',
    vibrancy: 0.5,
    contrast: 1.0,
    gamma: 2.0,
    highlightPower: 0.4,
    camera: {
      zoom: 1.0,
      position: [0, 0],
    },
  },
  finalTransform: { a: 0.9, b: 0.1, c: -0.05, d: -0.05, e: 1.05, f: 0 },
  transforms: {
    [tid('b0000000_0000_0000_0000_000000000001')]: {
      probability: 0.2,
      preAffine: { a: 0.7, b: 0, c: 0, d: 0, e: 0.7, f: 0.1 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.7, y: 0.2 },
      colorSpeed: 0.25,
      variations: {
        [vid('b1000000_0000_0000_0000_000000000001')]: {
          type: 'sinusoidalVar',
          weight: 1,
        },
        [vid('b2000000_0000_0000_0000_000000000001')]: {
          type: 'sphericalVar',
          weight: 0.4,
        },
      },
    },
    [tid('b0000000_0000_0000_0000_000000000002')]: {
      probability: 0.2,
      preAffine: { a: -0.5, b: 0.15, c: 0, d: 0.1, e: 0.55, f: -0.05 },
      postAffine: { a: 0.95, b: -0.1, c: 0.05, d: 0.1, e: 0.95, f: 0 },
      color: { x: -0.3, y: 0.5 },
      colorSpeed: 0.3,
      variations: {
        [vid('b1000000_0000_0000_0000_000000000002')]: {
          type: 'swirlVar',
          weight: 0.8,
        },
        [vid('b2000000_0000_0000_0000_000000000002')]: {
          type: 'juliaVar',
          weight: 0.6,
        },
      },
    },
    [tid('b0000000_0000_0000_0000_000000000003')]: {
      probability: 0.15,
      preAffine: { a: 0.4, b: 0.2, c: -0.1, d: -0.05, e: 0.45, f: 0.2 },
      postAffine: { a: 1.05, b: 0, c: 0, d: 0, e: 1.05, f: -0.05 },
      color: { x: 0.2, y: -0.4 },
      colorSpeed: 0.2,
      variations: {
        [vid('b1000000_0000_0000_0000_000000000003')]: {
          type: 'polarVar',
          weight: 0.7,
        },
        [vid('b2000000_0000_0000_0000_000000000003')]: {
          type: 'linearVar',
          weight: 0.5,
        },
        [vid('b3000000_0000_0000_0000_000000000003')]: {
          type: 'sinusoidalVar',
          weight: 0.3,
        },
      },
    },
    [tid('b0000000_0000_0000_0000_000000000004')]: {
      probability: 0.15,
      preAffine: { a: 0.6, b: -0.15, c: 0.1, d: 0.15, e: 0.5, f: -0.15 },
      postAffine: { a: 1, b: 0.05, c: -0.02, d: -0.05, e: 0.98, f: 0.05 },
      color: { x: -0.5, y: -0.3 },
      colorSpeed: 0.35,
      variations: {
        [vid('b1000000_0000_0000_0000_000000000004')]: {
          type: 'hyperbolicVar',
          weight: 0.6,
        },
        [vid('b2000000_0000_0000_0000_000000000004')]: {
          type: 'sphericalVar',
          weight: 0.5,
        },
      },
    },
    [tid('b0000000_0000_0000_0000_000000000005')]: {
      probability: 0.15,
      preAffine: { a: 0.55, b: 0, c: 0, d: 0, e: 0.55, f: 0 },
      postAffine: { a: 1, b: -0.1, c: 0.1, d: 0, e: 1, f: 0 },
      color: { x: 0.4, y: 0.6 },
      colorSpeed: 0.28,
      variations: {
        [vid('b1000000_0000_0000_0000_000000000005')]: {
          type: 'juliaScopeVar',
          weight: 0.5,
          params: { power: 2, dist: 1 },
        },
        [vid('b2000000_0000_0000_0000_000000000005')]: {
          type: 'swirlVar',
          weight: 0.4,
        },
        [vid('b3000000_0000_0000_0000_000000000005')]: {
          type: 'linearVar',
          weight: 0.3,
        },
      },
    },
    [tid('b0000000_0000_0000_0000_000000000006')]: {
      probability: 0.15,
      preAffine: { a: -0.45, b: -0.1, c: -0.05, d: 0.05, e: -0.5, f: 0.05 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0.03 },
      color: { x: -0.1, y: -0.6 },
      colorSpeed: 0.22,
      variations: {
        [vid('b1000000_0000_0000_0000_000000000006')]: {
          type: 'wavesVar',
          weight: 0.7,
        },
        [vid('b2000000_0000_0000_0000_000000000006')]: {
          type: 'sphericalVar',
          weight: 0.45,
        },
      },
    },
  },
})
