import { defineExample, tid, vid } from './util'

/**
 * Tidal Spiral — ocean-like fluid swirls with fractal depth.
 * Three transforms: swirl3Var spiral core, horseshoe+spherical distortion,
 * and a juliaScope fractal bloom.
 */
export const example8 = defineExample({
  version: '1.0',
  metadata: {
    author: 'unknown',
    name: 'Tidal Spiral',
    description:
      'ocean-like fluid swirls with fractal depth. Three transforms: swirl3Var spiral core, horseshoe+spherical distortion, and a juliaScope fractal bloom.',
  },
  renderSettings: {
    exposure: 0.3,
    skipIters: 20,
    drawMode: 'light',
    camera: {
      zoom: 1.2,
      position: [0.05, -0.05],
    },
  },
  transforms: {
    // T0: Swirl3Var core — creates the main spiral vortex
    [tid('a1b2c3d4_e5f6_7890_abcd_ef1234567890')]: {
      probability: 0.8,
      preAffine: { a: 0.6, b: 0.15, c: 0, d: -0.1, e: 0.55, f: 0.05 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.15, y: 0.4 },
      variations: {
        [vid('b1c2d3e4_f5a6_7890_cdef_0123456789ab')]: {
          type: 'swirl3Var',
          weight: 1,
          params: { shift: 7.5 },
        },
        [vid('c1d2e3f4_a5b6_7890_1234_567890abcdef')]: {
          type: 'linearVar',
          weight: 0.3,
        },
      },
    },
    // T1: Horseshoe + Spherical — warped projections creating wave-like distortion
    [tid('d1e2f3a4_b5c6_7890_2345_67890abcdef1')]: {
      probability: 0.45,
      preAffine: { a: 0.4, b: -0.3, c: 0.1, d: 0.25, e: 0.45, f: -0.15 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: -0.2, y: 0.15 },
      variations: {
        [vid('e1f2a3b4_c5d6_7890_3456_7890abcdef12')]: {
          type: 'horseshoeVar',
          weight: 0.7,
        },
        [vid('f1a2b3c4_d5e6_7890_4567_890abcdef123')]: {
          type: 'sphericalVar',
          weight: 0.3,
        },
        [vid('a1a2b3c4_d5e6_7890_5678_90abcdef1234')]: {
          type: 'linearVar',
          weight: 0.4,
        },
      },
    },
    // T2: JuliaScope fractal bloom — adds intricate fractal depth
    [tid('b1b2c3d4_e5f6_7890_6789_0abcdef12345')]: {
      probability: 0.2,
      preAffine: { a: 0.35, b: 0, c: -0.05, d: 0, e: 0.35, f: 0.05 },
      postAffine: { a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 },
      color: { x: 0, y: -0.3 },
      variations: {
        [vid('c1c2d3e4_f5a6_7890_7890_abcdef123456')]: {
          type: 'juliaScopeVar',
          weight: 1,
          params: { power: 2.5, dist: 2 },
        },
      },
    },
  },
})
