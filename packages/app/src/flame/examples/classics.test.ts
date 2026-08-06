import { describe, expect, it } from 'vitest'
import { barnsleyFern, cantorDust, classicExamples, heighwayDragon, kochCurve, mengerSponge, sierpinskiCarpet, sierpinskiTetrahedron, sierpinskiTriangle, } from './classics'
import type { AffineParams } from '../affineTranform'
import type { AffineParams3D } from '../affineTransform3D'
import type { FlameDescriptor } from '../schema/flameSchema'

type Point2D = readonly [number, number]
type Point3D = readonly [number, number, number]

const IDENTITY_2D = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
const IDENTITY_3D = {
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

function branches(flame: FlameDescriptor) {
  return Object.values(flame.transforms)
}

function apply2D(affine: AffineParams, [x, y]: Point2D): Point2D {
  return [
    affine.a * x + affine.b * y + affine.c,
    affine.d * x + affine.e * y + affine.f,
  ]
}

function apply3D(affine: AffineParams3D, [x, y, z]: Point3D): Point3D {
  return [
    affine.a * x + affine.b * y + affine.c * z + affine.d,
    affine.e * x + affine.f * y + affine.g * z + affine.h,
    affine.i * x + affine.j * y + affine.k * z + affine.l,
  ]
}

function scalePoint3D([x, y, z]: Point3D, scale: number): Point3D {
  return [x * scale, y * scale, z * scale]
}

function expectPoint2D(actual: Point2D, expected: Point2D) {
  expect(actual[0]).toBeCloseTo(expected[0], 12)
  expect(actual[1]).toBeCloseTo(expected[1], 12)
}

function expectPoint3D(actual: Point3D, expected: Point3D) {
  expect(actual[0]).toBeCloseTo(expected[0], 12)
  expect(actual[1]).toBeCloseTo(expected[1], 12)
  expect(actual[2]).toBeCloseTo(expected[2], 12)
}

describe('classic affine IFS descriptors', () => {
  const cases = [
    ['sierpinskiTriangle', sierpinskiTriangle, 3, 2, 'linearVar'],
    ['sierpinskiCarpet', sierpinskiCarpet, 8, 2, 'linearVar'],
    ['kochCurve', kochCurve, 4, 2, 'linearVar'],
    ['barnsleyFern', barnsleyFern, 4, 2, 'linearVar'],
    ['heighwayDragon', heighwayDragon, 2, 2, 'linearVar'],
    ['cantorDust', cantorDust, 4, 2, 'linearVar'],
    ['sierpinskiTetrahedron', sierpinskiTetrahedron, 4, 3, 'linear3D'],
    ['mengerSponge', mengerSponge, 20, 3, 'linear3D'],
  ] as const

  it('exports the complete eight-preset collection', () => {
    expect(Object.keys(classicExamples)).toEqual(cases.map(([name]) => name))
  })

  for (const [name, flame, count, dimensions, variationType] of cases) {
    it(`${name} is a normalized, linear ${dimensions}D IFS`, () => {
      const transforms = branches(flame)
      expect(transforms).toHaveLength(count)
      expect(flame.renderSettings.dimensions).toBe(dimensions)
      expect(transforms.reduce((sum, t) => sum + t.probability, 0)).toBeCloseTo(
        1,
        12,
      )

      for (const transform of transforms) {
        expect(transform.probability).toBeGreaterThan(0)
        expect(transform.visible).toBe(true)
        expect(transform.postAffine).toEqual(
          dimensions === 3 ? IDENTITY_3D : IDENTITY_2D,
        )
        const variations = Object.values(transform.variations)
        expect(variations).toHaveLength(1)
        expect(variations[0]).toMatchObject({
          type: variationType,
          weight: 1,
        })
      }
    })
  }

  it('fixes the three vertices of a centered equilateral Sierpiński triangle', () => {
    const root3Over2 = Math.sqrt(3) / 2
    const vertices: Point2D[] = [
      [-1, -root3Over2],
      [1, -root3Over2],
      [0, root3Over2],
    ]

    branches(sierpinskiTriangle).forEach((transform, index) => {
      expectPoint2D(
        apply2D(transform.preAffine, vertices[index]!),
        vertices[index]!,
      )
    })
  })

  it('places the carpet branches in every 3 × 3 cell except the center', () => {
    const centers = branches(sierpinskiCarpet).map((transform) =>
      apply2D(transform.preAffine, [0, 0]),
    )
    const expected = [-1, 0, 1].flatMap((y) =>
      [-1, 0, 1]
        .filter((x) => x !== 0 || y !== 0)
        .map((x): Point2D => [(2 * x) / 3, (2 * y) / 3]),
    )

    centers.forEach((center, index) => {
      expectPoint2D(center, expected[index]!)
    })
    expect(centers).not.toContainEqual([0, 0])
  })

  it('joins the four Koch maps into one exact, consecutive generator', () => {
    const root3Over3 = Math.sqrt(3) / 3
    const expected: Point2D[] = [
      [-1, 0],
      [-1 / 3, 0],
      [0, root3Over3],
      [1 / 3, 0],
      [1, 0],
    ]

    branches(kochCurve).forEach((transform, index) => {
      expectPoint2D(apply2D(transform.preAffine, [-1, 0]), expected[index]!)
      expectPoint2D(apply2D(transform.preAffine, [1, 0]), expected[index + 1]!)
    })
  })

  it('uses Barnsley’s canonical coefficient and probability table', () => {
    expect(
      branches(barnsleyFern).map(({ probability, preAffine }) => ({
        probability,
        preAffine,
      })),
    ).toEqual([
      {
        probability: 0.01,
        preAffine: { a: 0, b: 0, c: 0, d: 0, e: 0.16, f: 0 },
      },
      {
        probability: 0.85,
        preAffine: {
          a: 0.85,
          b: 0.04,
          c: 0,
          d: -0.04,
          e: 0.85,
          f: 1.6,
        },
      },
      {
        probability: 0.07,
        preAffine: {
          a: 0.2,
          b: -0.26,
          c: 0,
          d: 0.23,
          e: 0.22,
          f: 1.6,
        },
      },
      {
        probability: 0.07,
        preAffine: {
          a: -0.15,
          b: 0.28,
          c: 0,
          d: 0.26,
          e: 0.24,
          f: 0.44,
        },
      },
    ])
  })

  it('keeps a deterministic Barnsley chaos walk inside its canonical bounds', () => {
    const transforms = branches(barnsleyFern)
    let state = 0x6d2b79f5
    let point: Point2D = [0, 0]
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    for (let i = 0; i < 5_032; i++) {
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      const random = (state >>> 0) / 0x1_0000_0000
      let cumulative = 0
      const transform =
        transforms.find((candidate) => {
          cumulative += candidate.probability
          return random < cumulative
        }) ?? transforms.at(-1)!
      point = apply2D(transform.preAffine, point)
      if (i < 32) continue
      minX = Math.min(minX, point[0])
      maxX = Math.max(maxX, point[0])
      minY = Math.min(minY, point[1])
      maxY = Math.max(maxY, point[1])
    }

    expect(minX).toBeGreaterThanOrEqual(-2.2)
    expect(maxX).toBeLessThanOrEqual(2.7)
    expect(minY).toBeGreaterThanOrEqual(-0.01)
    expect(maxY).toBeLessThanOrEqual(10.1)
  })

  it('joins both Heighway branches at the fold point', () => {
    const [left, right] = branches(heighwayDragon)
    expectPoint2D(apply2D(left!.preAffine, [0, 0]), [0, 0])
    expectPoint2D(apply2D(left!.preAffine, [1, 0]), [0.5, 0.5])
    expectPoint2D(apply2D(right!.preAffine, [1, 0]), [0.5, 0.5])
    expectPoint2D(apply2D(right!.preAffine, [0, 0]), [1, 0])
  })

  it('fixes the four corners of Cantor dust', () => {
    const corners: Point2D[] = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]
    branches(cantorDust).forEach((transform, index) => {
      expectPoint2D(
        apply2D(transform.preAffine, corners[index]!),
        corners[index]!,
      )
    })
  })

  it('fixes the four vertices of the Sierpiński tetrahedron', () => {
    const vertices: Point3D[] = [
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
    ]
    branches(sierpinskiTetrahedron).forEach((transform, index) => {
      expectPoint3D(
        apply3D(transform.preAffine as AffineParams3D, vertices[index]!),
        vertices[index]!,
      )
    })
  })

  it('keeps exactly the twenty Menger corner and edge-center cells', () => {
    const expected = [-1, 0, 1].flatMap((z) =>
      [-1, 0, 1].flatMap((y) =>
        [-1, 0, 1]
          .filter((x) => Math.abs(x) + Math.abs(y) + Math.abs(z) >= 2)
          .map((x): Point3D => [x, y, z]),
      ),
    )
    const transforms = branches(mengerSponge)
    expect(transforms).toHaveLength(20)

    transforms.forEach((transform, index) => {
      const affine = transform.preAffine as AffineParams3D
      expectPoint3D(
        apply3D(affine, [0, 0, 0]),
        scalePoint3D(expected[index]!, 2 / 3),
      )
      expectPoint3D(apply3D(affine, expected[index]!), expected[index]!)
    })
  })
})
