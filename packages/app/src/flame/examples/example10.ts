import { defineExample, tid, vid } from './util'

/**
 * Solar Prominence — explosive solar-flare patterns with spirograph arcs,
 * gaussian starfield bursts, and juliaScope fractal tendrils.
 */
export const example10 = defineExample({
  version: '1.0',
  metadata: {
    author: 'unknown',
    name: 'Solar Prominence',
    description:
      'explosive solar-flare patterns with spirograph arcs, gaussian starfield bursts, and juliaScope fractal tendrils.',
  },
  renderSettings: {
    exposure: 0.3,
    skipIters: 20,
    drawMode: 'light',
    camera: {
      zoom: 1.0,
      position: [0, 0.05],
    },
  },
  transforms: {
    // T0: Spirograph + linear — sweeping epicycloid arcs like solar flares
    [tid('c3d4e5f6_a7b8_9012_3456_7890abcdef03')]: {
      probability: 0.7,
      preAffine: { a: 0.55, b: -0.1, c: 0, d: 0.1, e: 0.5, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.3, y: 0.1 },
      variations: {
        [vid('d3e4f5a6_b7c8_9012_4567_890abcdef034')]: {
          type: 'spirographVar',
          weight: 1,
          params: {
            a: 3,
            b: 2,
            d: 0.5,
            tmin: -1,
            tmax: 1,
            ymin: -0.5,
            ymax: 0.5,
            c1: 1,
            c2: 0.5,
          },
        },
        [vid('e3f4a5b6_c7d8_9012_5678_90abcdef0345')]: {
          type: 'linearVar',
          weight: 0.4,
        },
      },
    },
    // T1: Gaussian + spherical + swirl — random starfield bursts with swirl
    [tid('f3a4b5c6_d7e8_9012_6789_0abcdef03456')]: {
      probability: 0.4,
      preAffine: { a: 0.35, b: 0, c: 0, d: 0, e: 0.35, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: -0.2, y: -0.05 },
      variations: {
        [vid('a4b5c6d7_e8f9_0123_4567_890abcdef045')]: {
          type: 'gaussianVar',
          weight: 1,
        },
        [vid('b4c5d6e7_f8a9_0123_5678_90abcdef0456')]: {
          type: 'sphericalVar',
          weight: 0.6,
        },
        [vid('c4d5e6f7_a8b9_0123_6789_0abcdef04567')]: {
          type: 'swirlVar',
          weight: 0.15,
        },
      },
    },
    // T2: JuliaScope + sinusoidal — fractal tendrils with sine wave undulation
    [tid('d4e5f6a7_b8c9_0123_7890_abcdef045678')]: {
      probability: 0.2,
      preAffine: { a: 0.25, b: 0, c: 0.03, d: 0, e: 0.25, f: -0.03 },
      postAffine: { a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 },
      color: { x: 0.05, y: -0.25 },
      variations: {
        [vid('e4f5a6b7_c8d9_0123_8901_bcdef0456789')]: {
          type: 'juliaScopeVar',
          weight: 1,
          params: { power: 3, dist: 2.5 },
        },
        [vid('f4a5b6c7_d8e9_0123_9012_cdef04567890')]: {
          type: 'sinusoidalVar',
          weight: 0.2,
        },
      },
    },
  },
})
