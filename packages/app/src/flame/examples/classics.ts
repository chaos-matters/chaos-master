import { latestSchemaVersion } from '../schema/flameSchema'
import { defineExample, defineExample3D, tid, vid } from './util'
import type { AffineParams } from '../affineTranform'
import type { AffineParams3D } from '../affineTransform3D'

type ClassicMap2D = {
  affine: AffineParams
  probability?: number
}

type ClassicMap3D = {
  affine: AffineParams3D
  probability?: number
}

const IDENTITY_2D: AffineParams = {
  a: 1,
  b: 0,
  c: 0,
  d: 0,
  e: 1,
  f: 0,
}

const IDENTITY_3D: AffineParams3D = {
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
}

const SQRT_3 = Math.sqrt(3)

function colorForBranch(index: number, count: number) {
  const angle = 2 * Math.PI * (index / count + 0.08)
  return { x: 0.72 * Math.cos(angle), y: 0.72 * Math.sin(angle) }
}

function createClassic2D(config: {
  id: string
  name: string
  description: string
  camera: { zoom: number; position: [number, number] }
  maps: readonly ClassicMap2D[]
  exposure?: number
}) {
  const count = config.maps.length
  return defineExample({
    version: latestSchemaVersion,
    metadata: {
      author: 'Lumen Apeiron',
      name: config.name,
      description: config.description,
    },
    renderSettings: {
      dimensions: 2,
      exposure: config.exposure ?? 0.35,
      skipIters: 20,
      plotsPerChain: 16,
      drawMode: 'light',
      colorInitMode: 'colorInitZero',
      pointInitMode: 'pointInitUnitDisk',
      backgroundColor: [0, 0, 0],
      vibrancy: 0.9,
      contrast: 1.15,
      gamma: 2.2,
      paletteMode: 0,
      palettePhase: 0.08,
      paletteSpeed: 0.55,
      camera: config.camera,
    },
    transforms: Object.fromEntries(
      config.maps.map((map, index) => [
        tid(`classic_${config.id}_t${String(index).padStart(2, '0')}`),
        {
          probability: map.probability ?? 1 / count,
          preAffine: map.affine,
          postAffine: IDENTITY_2D,
          color: colorForBranch(index, count),
          colorSpeed: 0.55,
          variations: {
            [vid(`classic_${config.id}_v${String(index).padStart(2, '0')}`)]: {
              type: 'linearVar' as const,
              weight: 1,
            },
          },
        },
      ]),
    ),
  })
}

function createClassic3D(config: {
  id: string
  name: string
  description: string
  radius: number
  maps: readonly ClassicMap3D[]
  exposure?: number
  theta?: number
  phi?: number
}) {
  const count = config.maps.length
  return defineExample3D({
    version: latestSchemaVersion,
    metadata: {
      author: 'Lumen Apeiron',
      name: config.name,
      description: config.description,
    },
    renderSettings: {
      dimensions: 3,
      exposure: config.exposure ?? 0.45,
      skipIters: 20,
      plotsPerChain: 16,
      drawMode: 'light',
      colorInitMode: 'colorInitZero',
      pointInitMode: 'pointInitUnitBall',
      backgroundColor: [0, 0, 0],
      vibrancy: 0.9,
      contrast: 1.2,
      gamma: 2.8,
      depthColorPower: 0.4,
      lightDirection: [-0.45, 0.65, -0.65],
      lightPower: 0.1,
      highlightPower: 0.8,
      densityEstimationQuality: 0.8,
      estimatorCurve: 0.5,
      paletteMode: 0,
      palettePhase: 0.08,
      paletteSpeed: 0.55,
      camera: { zoom: 1, position: [0, 0] },
      camera3D: {
        theta: config.theta ?? Math.PI / 4,
        phi: config.phi ?? Math.acos(1 / Math.sqrt(3)),
        radius: config.radius,
        target: [0, 0, 0],
        fov: 55,
      },
    },
    transforms: Object.fromEntries(
      config.maps.map((map, index) => [
        tid(`classic_${config.id}_t${String(index).padStart(2, '0')}`),
        {
          probability: map.probability ?? 1 / count,
          preAffine: map.affine,
          postAffine: IDENTITY_3D,
          color: colorForBranch(index, count),
          colorSpeed: 0.55,
          variations: {
            [vid(`classic_${config.id}_v${String(index).padStart(2, '0')}`)]: {
              type: 'linear3D' as const,
              weight: 1,
            },
          },
        },
      ]),
    ),
  })
}

/** The canonical centered, equilateral three-map gasket. */
export const sierpinskiTriangle = createClassic2D({
  id: 'sierpinski_triangle',
  name: 'Sierpiński Triangle',
  description:
    'Classic IFS · An exact, centered equilateral gasket built from three half-scale affine maps.',
  camera: { zoom: 1, position: [0, 0] },
  maps: [
    {
      affine: { a: 0.5, b: 0, c: -0.5, d: 0, e: 0.5, f: -SQRT_3 / 4 },
    },
    {
      affine: { a: 0.5, b: 0, c: 0.5, d: 0, e: 0.5, f: -SQRT_3 / 4 },
    },
    {
      affine: { a: 0.5, b: 0, c: 0, d: 0, e: 0.5, f: SQRT_3 / 4 },
    },
  ],
})

/** Eight one-third-scale maps: every cell in a 3x3 grid except the center. */
export const sierpinskiCarpet = createClassic2D({
  id: 'sierpinski_carpet',
  name: 'Sierpiński Carpet',
  description:
    'Classic IFS · The exact eight-map 3 × 3 carpet, with the central square removed at every scale.',
  camera: { zoom: 0.9, position: [0, 0] },
  maps: [-1, 0, 1].flatMap((iy) =>
    [-1, 0, 1]
      .filter((ix) => ix !== 0 || iy !== 0)
      .map((ix) => ({
        affine: {
          a: 1 / 3,
          b: 0,
          c: (2 * ix) / 3,
          d: 0,
          e: 1 / 3,
          f: (2 * iy) / 3,
        },
      })),
  ),
})

/** Four oriented thirds joined end to end into the classic Koch generator. */
export const kochCurve = createClassic2D({
  id: 'koch_curve',
  name: 'Koch Curve',
  description:
    'Classic IFS · Four exact affine branches form the familiar infinite snowflake edge.',
  camera: { zoom: 1.55, position: [0, SQRT_3 / 6] },
  exposure: 0.55,
  maps: [
    { affine: { a: 1 / 3, b: 0, c: -2 / 3, d: 0, e: 1 / 3, f: 0 } },
    {
      affine: {
        a: 1 / 6,
        b: -SQRT_3 / 6,
        c: -1 / 6,
        d: SQRT_3 / 6,
        e: 1 / 6,
        f: SQRT_3 / 6,
      },
    },
    {
      affine: {
        a: 1 / 6,
        b: SQRT_3 / 6,
        c: 1 / 6,
        d: -SQRT_3 / 6,
        e: 1 / 6,
        f: SQRT_3 / 6,
      },
    },
    { affine: { a: 1 / 3, b: 0, c: 2 / 3, d: 0, e: 1 / 3, f: 0 } },
  ],
})

/** Michael Barnsley's standard four-map black-spleenwort fern. */
export const barnsleyFern = createClassic2D({
  id: 'barnsley_fern',
  name: 'Barnsley Fern',
  description:
    'Classic IFS · The canonical four-map fern: stem, successive leaflets, and the dominant affine frond.',
  camera: { zoom: 0.18, position: [0.237, 5] },
  exposure: 1.8,
  maps: [
    {
      probability: 0.01,
      affine: { a: 0, b: 0, c: 0, d: 0, e: 0.16, f: 0 },
    },
    {
      probability: 0.85,
      affine: { a: 0.85, b: 0.04, c: 0, d: -0.04, e: 0.85, f: 1.6 },
    },
    {
      probability: 0.07,
      affine: { a: 0.2, b: -0.26, c: 0, d: 0.23, e: 0.22, f: 1.6 },
    },
    {
      probability: 0.07,
      affine: { a: -0.15, b: 0.28, c: 0, d: 0.26, e: 0.24, f: 0.44 },
    },
  ],
})

/** The two-map paper-folding dragon, sharing its maps at the fold point. */
export const heighwayDragon = createClassic2D({
  id: 'heighway_dragon',
  name: 'Heighway Dragon',
  description:
    'Classic IFS · Two exact half-scale rotations trace the self-similar paper-folding dragon.',
  camera: { zoom: 1.7, position: [5 / 12, 1 / 6] },
  maps: [
    { affine: { a: 0.5, b: -0.5, c: 0, d: 0.5, e: 0.5, f: 0 } },
    { affine: { a: -0.5, b: -0.5, c: 1, d: 0.5, e: -0.5, f: 0 } },
  ],
})

/** The Cartesian product of two middle-third Cantor sets. */
export const cantorDust = createClassic2D({
  id: 'cantor_dust',
  name: 'Cantor Dust',
  description:
    'Classic IFS · Four exact corner maps produce the planar product of two middle-third Cantor sets.',
  camera: { zoom: 0.9, position: [0, 0] },
  maps: [-1, 1].flatMap((iy) =>
    [-1, 1].map((ix) => ({
      affine: {
        a: 1 / 3,
        b: 0,
        c: (2 * ix) / 3,
        d: 0,
        e: 1 / 3,
        f: (2 * iy) / 3,
      },
    })),
  ),
})

const TETRAHEDRON_VERTICES = [
  [1, 1, 1],
  [1, -1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
] as const

/** Four half-scale maps fixed at the vertices of a regular tetrahedron. */
export const sierpinskiTetrahedron = createClassic3D({
  id: 'sierpinski_tetrahedron',
  name: 'Sierpiński Tetrahedron',
  description:
    'Classic IFS · Four exact 3D affine maps form the tetrahedral analogue of the Sierpiński gasket.',
  radius: 3,
  maps: TETRAHEDRON_VERTICES.map(([x, y, z]) => ({
    affine: {
      a: 0.5,
      b: 0,
      c: 0,
      d: x / 2,
      e: 0,
      f: 0.5,
      g: 0,
      h: y / 2,
      i: 0,
      j: 0,
      k: 0.5,
      l: z / 2,
    },
  })),
})

/** Twenty one-third-scale maps: corners and edge centers of a 3x3x3 cube. */
export const mengerSponge = createClassic3D({
  id: 'menger_sponge',
  name: 'Menger Sponge',
  description:
    'Classic IFS · Twenty exact 3D affine branches remove every face center and the cube core, forever.',
  radius: 3.4,
  exposure: 0.2,
  theta: 0.28,
  phi: 1.32,
  maps: [-1, 0, 1].flatMap((z) =>
    [-1, 0, 1].flatMap((y) =>
      [-1, 0, 1]
        .filter((x) => Math.abs(x) + Math.abs(y) + Math.abs(z) >= 2)
        .map((x) => ({
          affine: {
            a: 1 / 3,
            b: 0,
            c: 0,
            d: (2 * x) / 3,
            e: 0,
            f: 1 / 3,
            g: 0,
            h: (2 * y) / 3,
            i: 0,
            j: 0,
            k: 1 / 3,
            l: (2 * z) / 3,
          },
        })),
    ),
  ),
})

export const classicExamples = {
  sierpinskiTriangle,
  sierpinskiCarpet,
  kochCurve,
  barnsleyFern,
  heighwayDragon,
  cantorDust,
  sierpinskiTetrahedron,
  mengerSponge,
}

export type ClassicExampleId = keyof typeof classicExamples
