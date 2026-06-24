import { latestSchemaVersion } from '../schema/flameSchema'
import { defineExample, tid, vid } from './util'

/**
 * Earth Flame — a glowing planet in a starfield, built to be spun.
 *   1. sphere3D body (points projected onto a clean spherical shell),
 *   2. swirl/sinusoidal surface turbulence ("continents"/atmosphere),
 *   3. a curl/gaussian fiery atmospheric glow,
 *   4. starfield3D — real 3D stars scattered on a far shell, so they orbit with
 *      the camera (true parallax) rather than sitting on a flat backdrop.
 * 3D preAffine is a 3x4 matrix: rows [a,b,c,d],[e,f,g,h],[i,j,k,l] (last col =
 * translation).
 */
const scale = (s: number) => ({
  a: s,
  b: 0,
  c: 0,
  d: 0,
  e: 0,
  f: s,
  g: 0,
  h: 0,
  i: 0,
  j: 0,
  k: s,
  l: 0,
})
const identity3D = scale(1)

export const example46 = defineExample({
  version: latestSchemaVersion,
  metadata: {
    author: 'chaos-master',
    name: 'Earth Flame',
    description:
      'A glowing 3D planet in a starfield — a sphere3D shell with swirling surface turbulence, a fiery atmospheric glow, and orbiting starfield3D stars. Spin it.',
  },
  renderSettings: {
    dimensions: 3,
    exposure: -1.0,
    skipIters: 20,
    drawMode: 'light',
    colorInitMode: 'colorInitZero',
    pointInitMode: 'pointInitUnitBall',
    vibrancy: 1.0,
    contrast: 2.6,
    gamma: 3.0,
    depthColorPower: 0.4,
    lightDirection: [-0.5, 0.4, -0.8],
    lightPower: 0.25,
    highlightPower: 1.0,
    // High-quality density estimation (was 0.6 — below the 0.8 default, which
    // over-blurred). Matches the sharper examples (≈ example33).
    densityEstimationQuality: 1.0,
    estimatorCurve: 0.85,
    camera: { zoom: 1, position: [0, 0] },
    camera3D: {
      theta: 0.6,
      phi: 1.45,
      radius: 3.0,
      target: [0, 0, 0],
      fov: 60,
    },
  },
  transforms: {
    // 1 — planet body: a clean sphere shell, ocean blue
    [tid('ea11b0d1_5c0a_47e1_9a31_0b6e2f10c001')]: {
      probability: 0.4,
      preAffine: identity3D,
      postAffine: identity3D,
      // Earth v2 "Sunrise": deeper ocean blue under the warm bloom.
      color: { x: -0.25, y: -0.52 },
      variations: {
        [vid('ea11b0d1_5c0a_47e1_9a31_0b6e2f10c011')]: {
          type: 'sphere3D',
          weight: 1,
        },
        [vid('ea11b0d1_5c0a_47e1_9a31_0b6e2f10c012')]: {
          type: 'spherical3D',
          weight: 0.22,
        },
      },
    },
    // 2 — surface turbulence ("continents"/atmosphere), green
    [tid('ea22c1e2_6d1b_48f2_8b42_1c7f3021d002')]: {
      probability: 0.3,
      preAffine: {
        a: 0.9,
        b: 0.12,
        c: 0,
        d: 0,
        e: -0.12,
        f: 0.9,
        g: 0,
        h: 0,
        i: 0,
        j: 0,
        k: 0.9,
        l: 0,
      },
      postAffine: identity3D,
      // Earth v2: slightly richer green continents.
      color: { x: -0.45, y: 0.26 },
      variations: {
        [vid('ea22c1e2_6d1b_48f2_8b42_1c7f3021d021')]: {
          type: 'swirl3D',
          weight: 0.55,
        },
        [vid('ea22c1e2_6d1b_48f2_8b42_1c7f3021d022')]: {
          type: 'sinusoidal3D',
          weight: 0.45,
        },
      },
    },
    // 3 — fiery atmospheric glow, warm orange
    [tid('ea33d2f3_7e2c_49a3_7c53_2d804132e003')]: {
      probability: 0.2,
      preAffine: scale(1.05),
      postAffine: identity3D,
      // Earth v2: hotter orange atmospheric bloom (sunrise rim).
      color: { x: 0.55, y: 0.45 },
      variations: {
        [vid('ea33d2f3_7e2c_49a3_7c53_2d804132e031')]: {
          type: 'curl3D',
          weight: 0.5,
        },
        [vid('ea33d2f3_7e2c_49a3_7c53_2d804132e032')]: {
          type: 'gaussian3D',
          weight: 0.3,
        },
      },
    },
    // 4 — starfield: real 3D stars on a far shell (orbit with the camera).
    // White, high colorSpeed so they snap to their own color (not tinted by the
    // planet's path), low probability so they stay sparse.
    [tid('ea44e304_8f3d_4ab4_6d64_3e905243f004')]: {
      probability: 0.16,
      preAffine: identity3D,
      postAffine: identity3D,
      color: { x: 0, y: 0 },
      colorSpeed: 0.95,
      variations: {
        [vid('ea44e304_8f3d_4ab4_6d64_3e905243f041')]: {
          type: 'starfield3D',
          weight: 1,
        },
      },
    },
  },
})
