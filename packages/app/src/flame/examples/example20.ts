import { defineExample, tid, vid } from './util'

/**
 * Quantum Tunnel — Light streams through a tubular energy corridor formed by
 * tunnelVar, while spirographVar traces orbital epicycles along the tunnel
 * walls. Butterfly wings and hyperbolic curvature add iridescent glow.
 * Rendered in paint mode for luminous bloom.
 */
export const example20 = defineExample({
  renderSettings: {
    exposure: 0.28,
    skipIters: 20,
    drawMode: 'paint',
    vibrancy: 0.7,
    contrast: 1.05,
    gamma: 2.0,
    highlightPower: 0.6,
    camera: {
      zoom: 1.0,
      position: [0, 0],
    },
  },
  transforms: {
    // T0: TunnelVar + swirl — energy corridor with spiral distortion
    [tid('a1b2c3d4_e5f6_020a_7890_abcdef123456')]: {
      probability: 0.5,
      preAffine: { a: 0.5, b: 0, c: 0, d: 0, e: 0.5, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.3, y: 0.15 },
      variations: {
        [vid('b2c3d4e5_f6a7_020b_8901_bcdef1234567')]: {
          type: 'tunnelVar',
          weight: 1,
          params: { Sx: 120, Sy: 40 },
        },
        [vid('c3d4e5f6_a7b8_020c_9012_cdef12345678')]: {
          type: 'swirl',
          weight: 0.15,
        },
      },
    },
    // T1: Spirograph + sinusoidal — orbital epicycles traced along the tunnel
    [tid('d4e5f6a7_b8c9_020d_0123_def123456789')]: {
      probability: 0.45,
      preAffine: { a: 0.4, b: 0.1, c: -0.02, d: -0.1, e: 0.4, f: 0.02 },
      postAffine: { a: 0.75, b: -0.15, c: 0, d: 0.15, e: 0.75, f: 0 },
      color: { x: -0.1, y: -0.15 },
      variations: {
        [vid('e5f6a7b8_c9d0_020e_1234_ef1234567890')]: {
          type: 'spirographVar',
          weight: 1,
          params: {
            a: 3.5,
            b: 1.8,
            d: 0.3,
            tmin: -1,
            tmax: 1,
            ymin: -0.5,
            ymax: 0.5,
            c1: 0.2,
            c2: -0.15,
          },
        },
        [vid('f6a7b8c9_d0e1_020f_2345_01234567890a')]: {
          type: 'sinusoidal',
          weight: 0.25,
        },
      },
    },
    // T2: Butterfly + hyperbolic — iridescent wings with radial stretch
    [tid('a7b8c9d0_e1f2_020g_3456_1234567890ab')]: {
      probability: 0.3,
      preAffine: { a: 0.35, b: 0, c: 0, d: 0, e: 0.35, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0, y: -0.35 },
      variations: {
        [vid('b8c9d0e1_f2a3_020h_4567_234567890abc')]: {
          type: 'butterflyVar',
          weight: 0.8,
        },
        [vid('c9d0e1f2_a3b4_020i_5678_34567890abcd')]: {
          type: 'hyperbolic',
          weight: 0.35,
        },
      },
    },
  },
})
