import { defineExample } from './util'

/**
 * 3D Shells
 * A 3D flame combining bubble, spherical, swirl and julia3D variations.
 */
export const example33 = defineExample({
  version: '1.0',
  metadata: {
    author: 'deluksic',
    name: '3D Shells',
    description:
      'A 3D flame combining bubble, spherical, swirl and julia3D variations.',
  },
  renderSettings: {
    exposure: -4.583,
    skipIters: 24,
    dimensions: 3,
    drawMode: 'light',
    colorInitMode: 'colorInitZero',
    pointInitMode: 'pointInitUnitBall',
    vibrancy: 1.8,
    contrast: 6.89,
    gamma: 5.71,
    highlightPower: 0.1,
    densityEstimationQuality: 1,
    estimatorCurve: 0.85,
    paletteMode: 0,
    palettePhase: 0,
    paletteSpeed: 0.5,
    camera: {
      zoom: 1,
      position: [0, 0],
    },
  },
  transforms: {
    '3d_shells_a': {
      probability: 0.5,
      preAffine: {
        a: 0.6,
        b: 0,
        c: 0.2,
        d: 0,
        e: 0,
        f: 0.6,
        g: 0,
        h: 0,
        i: -0.2,
        j: 0,
        k: 0.6,
        l: 0,
      },
      postAffine: {
        a: 1,
        b: 0,
        c: 0,
        d: 0,
        e: 0,
        f: 1,
        g: 0,
        h: 0,
        i: 0,
        j: 0,
        k: 1,
        l: 0,
      },
      color: {
        x: 0.05,
        y: 0.25,
      },
      colorSpeed: 0.4,

      variations: {
        '3d_shells_a_v0': {
          type: 'bubble3D',
          weight: 1,
        },
      },
    },
    '3d_shells_b': {
      probability: 0.3,
      preAffine: {
        a: 0.7,
        b: 0.1,
        c: 0,
        d: 0,
        e: -0.1,
        f: 0.7,
        g: 0,
        h: 0,
        i: 0,
        j: 0,
        k: 0.7,
        l: 0,
      },
      postAffine: {
        a: 1,
        b: 0,
        c: 0,
        d: 0,
        e: 0,
        f: 1,
        g: 0,
        h: 0,
        i: 0,
        j: 0,
        k: 1,
        l: 0,
      },
      color: {
        x: -0.25,
        y: 0.05,
      },
      colorSpeed: 0.4,

      variations: {
        '3d_shells_b_v0': {
          type: 'spherical3D',
          weight: 0.6,
        },
        '3d_shells_b_v1': {
          type: 'swirl3D',
          weight: 0.4,
        },
      },
    },
    '3d_shells_c': {
      probability: 0.2,
      preAffine: {
        a: 0.4,
        b: 0,
        c: 0,
        d: 0.15,
        e: 0,
        f: 0.4,
        g: 0,
        h: 0,
        i: 0,
        j: 0,
        k: 0.4,
        l: 0.15,
      },
      postAffine: {
        a: 1,
        b: 0,
        c: 0,
        d: 0,
        e: 0,
        f: 1,
        g: 0,
        h: 0,
        i: 0,
        j: 0,
        k: 1,
        l: 0,
      },
      color: {
        x: 0.1,
        y: -0.35,
      },
      colorSpeed: 0.56,

      variations: {
        '3d_shells_c_v0': {
          type: 'julia3D',
          weight: 0.887,
        },
        '3d_shells_c_v1': {
          type: 'bubble3D',
          weight: 0.5,
        },
      },
    },
  },
})
