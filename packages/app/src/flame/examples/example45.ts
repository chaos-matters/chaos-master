import { latestSchemaVersion } from '../schema/flameSchema'
import { defineExample, tid, vid } from './util'

/**
 * Spectrum Swirl — ported from the landing design mockup's `swirlbloom` CPU
 * preset (the original "nice" hero background). Three transforms:
 *   1. a dominant swirl + linear bloom,
 *   2. a sinusoidal / spherical fold,
 *   3. a spherical bloom,
 * with per-transform colors spread across a teal → yellow → magenta spectrum
 * (the mockup's `spectrum` palette). Camera/zoom and gamma mirror the preset.
 * Used as the marketing landing hero flame.
 */
export const example45 = defineExample({
  version: latestSchemaVersion,
  metadata: {
    author: 'chaos-master',
    name: 'Spectrum Swirl',
    description:
      'Teal-to-magenta IFS bloom (swirl + sinusoidal + spherical), ported from the landing mockup hero background.',
  },
  renderSettings: {
    exposure: -0.222,
    skipIters: 20,
    plotsPerChain: 16,
    drawMode: 'light',
    vibrancy: 0.95,
    contrast: 1.11,
    gamma: 3.33,
    highlightPower: 0.69,
    densityEstimationQuality: 1,
    estimatorCurve: 0.15,
    camera: {
      zoom: 1.129471311492809,
      position: [-0.01977488398551941, -0.062302835285663605],
    },
  },
  transforms: {
    // 1 — swirl + linear (weight 4/9), teal-green
    [tid('b1e7c4a0_9d32_4f18_a7c1_3e5f0a2b8c10')]: {
      probability: 0.45,
      preAffine: { a: 0.42, b: -0.18, c: 0, d: 0.18, e: 0.42, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: -0.4, y: 0.05 },
      variations: {
        [vid('c2f8d5b1_ae43_4029_b8d2_4f60a3c9d021')]: {
          type: 'swirlVar',
          weight: 0.6,
        },
        [vid('d3a9e6c2_bf54_4130_c9e3_5a71b4d0e132')]: {
          type: 'linearVar',
          weight: 0.4,
        },
      },
    },
    // 2 — sinusoidal + spherical (weight 3/9), yellow-orange
    [tid('e4baf7d3_c065_4241_daf4_6b82c5e1f243')]: {
      probability: 0.33,
      preAffine: { a: 0.38, b: 0.33, c: 0.35, d: -0.33, e: 0.38, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.1, y: 0.45 },
      variations: {
        [vid('f5cb08e4_d176_4352_ebf5_7c93d6f20354')]: {
          type: 'sinusoidalVar',
          weight: 0.5,
        },
        [vid('06dc19f5_e287_4463_fc06_8da4e7031465')]: {
          type: 'sphericalVar',
          weight: 0.5,
        },
      },
    },
    // 3 — spherical bloom (weight 2/9), magenta-pink
    [tid('17ed2a06_f398_4574_0d17_9eb5f8142576')]: {
      probability: 0.22,
      preAffine: { a: 0.4, b: 0, c: -0.4, d: 0, e: 0.4, f: 0.25 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.35, y: -0.15 },
      variations: {
        [vid('28fe3b17_04a9_4685_1e28_afc609253687')]: {
          type: 'sphericalVar',
          weight: 1,
        },
      },
    },
  },
})
