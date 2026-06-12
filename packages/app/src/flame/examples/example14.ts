import { defineExample, tid, vid } from './util'

/**
 * Ripple Veil — Dynamic interference ripples cascade across a frequency grid
 * with hexagonal cell distortions and spiral flow.
 */
export const example14 = defineExample({
  version: '1.0',
  metadata: {
    author: 'unknown',
    name: 'Ripple Veil',
    description:
      'Dynamic interference ripples cascade across a frequency grid with hexagonal cell distortions and spiral flow.',
  },
  renderSettings: {
    exposure: 0.28,
    skipIters: 20,
    drawMode: 'light',
    camera: {
      zoom: 1.1,
      position: [0.02, -0.02],
    },
  },
  transforms: {
    // T0: Ripple + sinusoidal — wave interference patterns with sine flow
    [tid('d1e2f3a4_b5c6_7890_1234_567890abcdef')]: {
      probability: 0.6,
      preAffine: { a: 0.55, b: 0, c: 0, d: 0, e: 0.55, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.1, y: 0.3 },
      variations: {
        [vid('e2f3a4b5_c6d7_8901_2345_678901abcdef')]: {
          type: 'rippleVar',
          weight: 1,
          params: {
            frequency: 2.0,
            velocity: 1.0,
            amplitude: 0.5,
            centerx: 0.0,
            centery: 0.0,
            phase: 0.0,
            scale: 1.0,
            fixed_dist_calc: 0,
          },
        },
        [vid('f3a4b5c6_d7e8_9012_3456_789012abcdef')]: {
          type: 'sinusoidalVar',
          weight: 0.3,
        },
      },
    },
    // T1: SinusGrid + spherical — frequency grid modulated by spherical projection
    [tid('a4b5c6d7_e8f9_0123_4567_890123abcdef')]: {
      probability: 0.45,
      preAffine: { a: 0.45, b: 0.08, c: -0.02, d: -0.08, e: 0.45, f: 0.02 },
      postAffine: { a: 0.8, b: 0, c: 0, d: 0, e: 0.8, f: 0 },
      color: { x: -0.15, y: 0.05 },
      variations: {
        [vid('b5c6d7e8_f9a0_1234_5678_901234abcdef')]: {
          type: 'sinusGridVar',
          weight: 1,
          params: { ampx: 0.5, ampy: 0.6, freqx: 1.2, freqy: 1.0 },
        },
        [vid('c6d7e8f9_a0b1_2345_6789_012345abcdef')]: {
          type: 'sphericalVar',
          weight: 0.4,
        },
      },
    },
    // T2: Hexes + spiral — hexagonal mesh with spiral outflow
    [tid('d7e8f9a0_b1c2_3456_7890_123456abcdef')]: {
      probability: 0.25,
      preAffine: { a: 0.35, b: 0, c: 0, d: 0, e: 0.35, f: 0 },
      postAffine: { a: 0.6, b: 0, c: 0, d: 0, e: 0.6, f: 0 },
      color: { x: -0.05, y: -0.15 },
      variations: {
        [vid('e8f9a0b1_c2d3_4567_8901_234567abcdef')]: {
          type: 'hexesVar',
          weight: 0.9,
          params: { cellsize: 0.1, power: 1.0, rotate: 0, scale: 0.75 },
        },
        [vid('f9a0b1c2_d3e4_5678_9012_345678abcdef')]: {
          type: 'spiralVar',
          weight: 0.2,
        },
      },
    },
  },
})
