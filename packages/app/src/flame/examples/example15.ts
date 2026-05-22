import { defineExample, tid, vid } from './util'

/**
 * Pixel Storm — Digital glitch fractals collide with sacred-geometry star
 * polygons. pixelFlow directional bleed, scry2 multi-sided stars, and
 * popcorn2 clustered bursts create a cyberpunk-mystical hybrid.
 */
export const example15 = defineExample({
  renderSettings: {
    exposure: 0.3,
    skipIters: 20,
    drawMode: 'light',
    camera: {
      zoom: 1.15,
      position: [0, 0],
    },
  },
  transforms: {
    // T0: PixelFlow + swirl — directional pixel bleed with swirl distortion
    [tid('a1e2c3d4_b5f6_7890_1234_567890abcdef')]: {
      probability: 0.5,
      preAffine: { a: 0.5, b: 0, c: 0, d: 0, e: 0.5, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.4, y: 0.1 },
      variations: {
        [vid('b2f3c4d5_a6e7_8901_2345_678901abcdef')]: {
          type: 'pixelFlowVar',
          weight: 1,
          params: {
            angle: 90.0,
            len: 0.1,
            width: 200.0,
            seed: 42.0,
            enableDirectColor: 0.0,
          },
        },
        [vid('c3a4d5e6_b7f8_9012_3456_789012abcdef')]: {
          type: 'swirl',
          weight: 0.25,
        },
      },
    },
    // T1: Scry2 + popcorn2 — multi-sided star polygons with popcorn clusters
    [tid('d4b5e6f7_a8c9_0123_4567_890123abcdef')]: {
      probability: 0.45,
      preAffine: { a: 0.4, b: 0.1, c: -0.02, d: -0.1, e: 0.4, f: 0.02 },
      postAffine: { a: 0.85, b: 0, c: 0, d: 0, e: 0.85, f: 0 },
      color: { x: -0.1, y: -0.1 },
      variations: {
        [vid('e5c6d7f8_a9b0_1234_5678_901234abcdef')]: {
          type: 'scry2Var',
          weight: 1,
          params: { sides: 4.0, star: 0.0, circle: 0.0 },
        },
        [vid('f6d7e8a9_b0c1_2345_6789_012345abcdef')]: {
          type: 'popcorn2Var',
          weight: 0.4,
          params: { x: 1.0, y: 0.5, c: 1.5 },
        },
      },
    },
    // T2: LinearTVar + gaussian — power-distorted linear with gaussian stars
    [tid('a7e8f9b0_c1d2_3456_7890_123456abcdef')]: {
      probability: 0.3,
      preAffine: { a: 0.3, b: 0, c: 0, d: 0, e: 0.3, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0, y: -0.25 },
      variations: {
        [vid('b8f9a0c1_d2e3_4567_8901_234567abcdef')]: {
          type: 'linearTVar',
          weight: 0.8,
          params: { powX: 1.2, powY: 0.9 },
        },
        [vid('c9a0b1d2_e3f4_5678_9012_345678abcdef')]: {
          type: 'gaussian',
          weight: 0.3,
        },
      },
    },
  },
})
