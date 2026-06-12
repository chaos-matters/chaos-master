import { defineExample, tid, vid } from './util'

/**
 * Prism Cascade — light-splitting cascade of geometric color.
 * Polar+cosine creates prismatic arcs, fan2+spherical adds
 * kaleidoscopic geometry, and juliaScope+eyefish adds depth.
 */
export const example12 = defineExample({
  version: '1.0',
  metadata: {
    author: 'unknown',
    name: 'Prism Cascade',
    description:
      'light-splitting cascade of geometric color. Polar+cosine creates prismatic arcs, fan2+spherical adds kaleidoscopic geometry, and juliaScope+eyefish adds depth.',
  },
  renderSettings: {
    exposure: 0.28,
    skipIters: 20,
    drawMode: 'light',
    camera: {
      zoom: 1.1,
      position: [0, 0],
    },
  },
  transforms: {
    // T0: Polar + cosine — polar coordinates create radial arcs, cosine adds wave
    [tid('a7b8c9d0_e1f2_3456_7890_abcdef056789')]: {
      probability: 0.65,
      preAffine: { a: 0.6, b: 0, c: 0, d: 0, e: 0.6, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.2, y: 0.35 },
      variations: {
        [vid('b7c8d9e0_f1a2_3456_8901_bcdef0567890')]: {
          type: 'polarVar',
          weight: 1,
        },
        [vid('c7d8e9f0_a1b2_3456_9012_cdef05678901')]: {
          type: 'cosineVar',
          weight: 0.7,
        },
        [vid('d7e8f9a0_b1c2_3456_0123_def056789012')]: {
          type: 'linearVar',
          weight: 0.3,
        },
      },
    },
    // T1: Fan2 + spherical — kaleidoscopic wedges projected outward
    [tid('e7f8a9b0_c1d2_3456_1234_ef0567890123')]: {
      probability: 0.4,
      preAffine: { a: 0.45, b: 0.15, c: -0.05, d: -0.1, e: 0.45, f: 0.05 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: -0.15, y: 0 },
      variations: {
        [vid('f7a8b9c0_d1e2_3456_2345_056789012345')]: {
          type: 'fan2Var',
          weight: 0.9,
          params: { x: 0.5, y: 0.7 },
        },
        [vid('a8b9c0d1_e2f3_4567_8901_bcdef0123456')]: {
          type: 'sphericalVar',
          weight: 0.4,
        },
        [vid('b8c9d0e1_f2a3_4567_9012_cdef01234567')]: {
          type: 'linearVar',
          weight: 0.3,
        },
      },
    },
    // T2: JuliaScope + eyefish — fractal core with fish-eye depth
    [tid('c8d9e0f1_a2b3_4567_0123_def012345678')]: {
      probability: 0.2,
      preAffine: { a: 0.3, b: 0, c: 0, d: 0, e: 0.3, f: 0 },
      postAffine: { a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 },
      color: { x: 0, y: -0.3 },
      variations: {
        [vid('d8e9f0a1_b2c3_4567_1234_ef0123456789')]: {
          type: 'juliaScopeVar',
          weight: 1,
          params: { power: 4, dist: 2 },
        },
        [vid('e8f9a0b1_c2d3_4567_2345_01234567890a')]: {
          type: 'eyefishVar',
          weight: 0.2,
        },
      },
    },
  },
})
