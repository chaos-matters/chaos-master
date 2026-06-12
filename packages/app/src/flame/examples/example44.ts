import { latestSchemaVersion } from '../schema/flameSchema'
import { defineExample, tid, vid } from './util'

/**
 * Enchanted Rose v2 — an improved Beauty and the Beast rose.
 *
 * Design philosophy:
 * - Transform A: **Rose petals** — disc3D creates petal-shell shapes,
 *   julia3D folds them into layered rose-like geometry. Tight affine
 *   scaling keeps petals compact. Color coord targets warm reds.
 * - Transform B: **Inner bloom** — spiral3D swirls petals inward,
 *   power3D gives smooth curvature. Slightly offset color for depth.
 * - Transform C: **Stem** — bent3D creates the organic drooping stem,
 *   linear3D anchors it vertically. Downward translation (l param).
 *   Color coord targets greens.
 * - Transform D: **Glass dome** — bubble3D at large scale creates a
 *   translucent spherical enclosure. Very low probability so it's
 *   sparse/ghostly. Neutral color for glass-like appearance.
 *
 * Render settings tuned for dramatic enchanted lighting with
 * strong depth coloring (red→blue gradient), negative exposure
 * for dark background, and uplighting from below.
 */
export const example44 = defineExample({
  version: latestSchemaVersion,
  metadata: {
    author: 'unknown',
    name: 'Enchanted Rose v2',
    description:
      "an improved Beauty and the Beast rose. Design philosophy: - Transform A: **Rose petals** — disc3D creates petal-shell shapes, julia3D folds them into layered rose-like geometry. Tight affine scaling keeps petals compact. Color coord targets warm reds. - Transform B: **Inner bloom** — spiral3D swirls petals inward, power3D gives smooth curvature. Slightly offset color for depth. - Transform C: **Stem** — bent3D creates the organic drooping stem, linear3D anchors it vertically. Downward translation (l param). Color coord targets greens. - Transform D: **Glass dome** — bubble3D at large scale creates a translucent spherical enclosure. Very low probability so it's sparse/ghostly. Neutral color for glass-like appearance. Render settings tuned for dramatic enchanted lighting with strong depth coloring (red→blue gradient), negative exposure for dark background, and uplighting from below.",
  },
  renderSettings: {
    dimensions: 3,
    exposure: -3.0,
    skipIters: 22,
    drawMode: 'light',
    colorInitMode: 'colorInitZero',
    pointInitMode: 'pointInitUnitBall',
    vibrancy: 1.2,
    contrast: 5.8,
    gamma: 4.0,
    depthColorPower: 0.0,
    lightDirection: [0, -0.6, -0.8],
    lightPower: 0.1,
    highlightPower: 1.4,
    densityEstimationQuality: 0.6,
    estimatorCurve: 0.32,
    paletteMode: 0,
    palettePhase: 0,
    paletteSpeed: 0.45,
    camera: { zoom: 1, position: [0, 0] },
    camera3D: {
      theta: 5.8,
      phi: 2.6,
      radius: 1.7,
      target: [0, 0, 0],
      fov: 55,
    },
  },
  transforms: {
    // --- Rose petals: folded disc shells ---
    [tid('3d_rose2_petals')]: {
      probability: 0.4,
      preAffine: {
        a: 0.65,
        b: 0.15,
        c: 0,
        d: 0,
        e: -0.15,
        f: 0.65,
        g: 0,
        h: 0.05,
        i: 0,
        j: 0,
        k: 0.55,
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
      color: { x: 0.12, y: 0.35 },
      colorSpeed: 0.5,
      variations: {
        [vid('3d_rose2_petals_v0')]: { type: 'disc3D', weight: 0.6 },
        [vid('3d_rose2_petals_v1')]: { type: 'julia3D', weight: 0.5 },
      },
    },
    // --- Inner bloom: spiraling petal core ---
    [tid('3d_rose2_bloom')]: {
      probability: 0.3,
      preAffine: {
        a: 0.7,
        b: 0,
        c: 0.1,
        d: 0,
        e: 0,
        f: 0.7,
        g: -0.1,
        h: 0.08,
        i: -0.1,
        j: 0.1,
        k: 0.6,
        l: 0,
      },
      postAffine: {
        a: 0,
        b: -1,
        c: 0,
        d: 0,
        e: 1,
        f: 0,
        g: 0,
        h: 0,
        i: 0,
        j: 0,
        k: 1,
        l: 0,
      },
      color: { x: -0.1, y: 0.2 },
      colorSpeed: 0.4,
      variations: {
        [vid('3d_rose2_bloom_v0')]: { type: 'spiral3D', weight: 0.7 },
        [vid('3d_rose2_bloom_v1')]: { type: 'power3D', weight: 0.35 },
      },
    },
    // --- Stem: organic drooping vertical ---
    [tid('3d_rose2_stem')]: {
      probability: 0.15,
      preAffine: {
        a: 0.2,
        b: 0,
        c: 0,
        d: 0,
        e: 0,
        f: 0.6,
        g: 0,
        h: -0.35,
        i: 0,
        j: 0,
        k: 0.2,
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
      color: { x: 0.5, y: -0.3 },
      colorSpeed: 0.35,
      variations: {
        [vid('3d_rose2_stem_v0')]: { type: 'bent3D', weight: 0.6 },
        [vid('3d_rose2_stem_v1')]: { type: 'linear3D', weight: 0.5 },
      },
    },
    // --- Glass dome: sparse translucent sphere ---
    [tid('3d_rose2_glass')]: {
      probability: 0.15,
      preAffine: {
        a: 1.1,
        b: 0,
        c: 0,
        d: 0,
        e: 0,
        f: 1.1,
        g: 0,
        h: 0,
        i: 0,
        j: 0,
        k: 1.1,
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
      color: { x: -0.35, y: -0.1 },
      colorSpeed: 0.2,
      variations: {
        [vid('3d_rose2_glass_v0')]: { type: 'bubble3D', weight: 1.0 },
      },
    },
  },
})
