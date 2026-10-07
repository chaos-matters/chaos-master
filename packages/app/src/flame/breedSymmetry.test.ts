// Breed keeps a parent's symmetry: the child is bred from user transforms only and gets the set of the parent it takes the most user transforms from.
import { describe, expect, it } from 'vitest'
import { deepClone } from '@/utils/clone'
import { breedFlames, CROSSOVER_MODES } from './breedFlame'
import { validateFlame } from './schema/flameSchema'
import { applySymmetryToFlame, symmetryRotationPreAffine, symmetryWeight, } from './symmetry'
import { detectSymmetryFolds, detectSymmetryType } from './symmetryDetection'
import { bases } from './symmetryTestUtils'
import type { FlameDescriptor, TransformId } from './schema/flameSchema'
import type { SymmetryType } from './symmetryDetection'
import type { Dims } from './symmetryTestUtils'

type SymmetrySet = { folds: number; type: SymmetryType }

/** Each parent's user transforms carry its own colorSpeed, which breeding
 *  passes through untouched, so a child's transform says where it came from.
 *  The generated copies carry colorSpeed 0. */
const A = 0.11
const B = 0.77

const isCopy = (tid: string) => tid.startsWith('_sym__')
const copies = (flame: FlameDescriptor) =>
  Object.entries(flame.transforms).filter(([tid]) => isCopy(tid))
const users = (flame: FlameDescriptor) =>
  Object.entries(flame.transforms).filter(([tid]) => !isCopy(tid))

/** The set the Symmetry card shows for a flame, or undefined for none. */
function setOf(flame: FlameDescriptor): SymmetrySet | undefined {
  const values = copies(flame).map(([, t]) => t)
  if (values.length === 0) return undefined
  return {
    folds: detectSymmetryFolds(values),
    type: detectSymmetryType(values),
  }
}

const VARIATION: Record<Dims, { a: string; b: string }> = {
  2: { a: 'sphericalVar', b: 'swirlVar' },
  3: { a: 'spherical3D', b: 'swirl3D' },
}

/** A parent with `count` user transforms marked `marker`, and a set if given. */
function parent(
  dims: Dims,
  marker: typeof A | typeof B,
  count: number,
  set?: SymmetrySet,
): FlameDescriptor {
  const base = deepClone(bases[dims])
  const t1 = base.transforms['t1' as TransformId]!
  const type = marker === A ? VARIATION[dims].a : VARIATION[dims].b
  const transforms = Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `${marker === A ? 'pa' : 'pb'}${i}`,
      {
        ...deepClone(t1),
        colorSpeed: marker,
        probability: 0.3 + 0.1 * i,
        variations: { v1: { type, weight: 1, visible: true } },
      },
    ]),
  )
  const flame = validateFlame({ ...base, transforms })
  return set ? applySymmetryToFlame(flame, set.folds, set.type) : flame
}

/** A flame's copies as the parent shows them: everything but the weight,
 *  which the child's own transforms decide. */
/** The copies' preAffines and hidden count, whatever their ids. */
const look = (flame: FlameDescriptor) => ({
  preAffines: copies(flame)
    .map(([, t]) => JSON.stringify(t.preAffine))
    .sort(),
  hidden: copies(flame).filter(([, t]) => !t.visible).length,
})
const shown = (flame: FlameDescriptor) =>
  Object.fromEntries(
    copies(flame).map(([tid, { probability: _weight, ...rest }]) => [
      tid,
      rest,
    ]),
  )

/** Everything a child must satisfy, whatever its parents were. */
function expectChild(
  child: FlameDescriptor,
  parentA: FlameDescriptor,
  parentB: FlameDescriptor,
) {
  // Bred from user transforms only: every transform that is not a copy
  // came from a parent's user transform, so no copy was renamed to breed_.
  for (const [, t] of users(child)) expect([A, B]).toContain(t.colorSpeed)
  for (const [tid] of copies(child)) expect(tid).not.toContain('breed_')

  const fromA = users(child).filter(([, t]) => t.colorSpeed === A).length
  const fromB = users(child).filter(([, t]) => t.colorSpeed === B).length
  const source = fromA >= fromB ? parentA : parentB
  // The card shows the source parent's set, and the copies are that
  // parent's own, as it shows them (angles, hidden copies), at the child's
  // weight.
  expect(setOf(child)).toEqual(setOf(source))
  expect(shown(child)).toEqual(shown(source))
  for (const [, copy] of copies(child)) {
    expect(copy.probability).toBe(symmetryWeight(child.transforms))
  }
}

const ROT4: SymmetrySet = { folds: 4, type: 'rotational' }
const DIH3: SymmetrySet = { folds: 3, type: 'dihedral' }

describe('Breed keeps a parent symmetry', () => {
  for (const dims of [2, 3] as const) {
    for (const mode of CROSSOVER_MODES) {
      it(`${dims}D ${mode}: two parents with different sets`, () => {
        const pa = parent(dims, A, 3, ROT4)
        const pb = parent(dims, B, 2, DIH3)
        const children = breedFlames(pa, pb, { count: 9, crossoverMode: mode })
        expect(children.length).toBeGreaterThan(0)
        for (const child of children) expectChild(child, pa, pb)
      })

      it(`${dims}D ${mode}: one parent symmetric`, () => {
        const pa = parent(dims, A, 2)
        const pb = parent(dims, B, 3, DIH3)
        const children = breedFlames(pa, pb, { count: 9, crossoverMode: mode })
        expect(children.length).toBeGreaterThan(0)
        for (const child of children) expectChild(child, pa, pb)
      })

      it(`${dims}D ${mode}: neither parent symmetric`, () => {
        const pa = parent(dims, A, 2)
        const pb = parent(dims, B, 3)
        for (const child of breedFlames(pa, pb, {
          count: 9,
          crossoverMode: mode,
        })) {
          expect(copies(child)).toHaveLength(0)
          expectChild(child, pa, pb)
        }
      })
    }

    it(`${dims}D: a tie in the counts gives the first parent's set`, () => {
      // Alternate over 2 + 2 transforms takes A0 then B0: one each.
      const pa = parent(dims, A, 2, ROT4)
      const pb = parent(dims, B, 2, DIH3)
      for (const [first, second] of [
        [pa, pb],
        [pb, pa],
      ] as const) {
        for (const child of breedFlames(first, second, {
          count: 3,
          crossoverMode: 'alternate',
        })) {
          expect(users(child)).toHaveLength(2)
          expect(setOf(child)).toEqual(setOf(first))
        }
      }
    })

    it(`${dims}D: a parent whose rotation was edited passes the edit on`, () => {
      const pa = parent(dims, A, 2, ROT4)
      const [editedId] = copies(pa)[0]!
      pa.transforms[editedId as TransformId]!.preAffine =
        symmetryRotationPreAffine(1, dims === 3 ? '3D' : '2D')
      const pb = parent(dims, B, 2)
      const [tied] = breedFlames(pa, pb, {
        count: 1,
        crossoverMode: 'alternate',
      })
      expect(look(tied!)).toEqual(look(pa))
      for (const mode of CROSSOVER_MODES) {
        for (const child of breedFlames(pa, pb, {
          count: 6,
          crossoverMode: mode,
        })) {
          expectChild(child, pa, pb)
        }
      }
      // Alternate over 2 + 2 is a tie, so pa's copies, edit included.
      for (const child of breedFlames(pa, pb, {
        count: 3,
        crossoverMode: 'alternate',
      })) {
        expect(look(child)).toEqual(look(pa))
        expect(shown(child)).toEqual(shown(pa))
      }
    })

    for (const [label, hide] of [
      ['one copy hidden', (ids: string[]) => ids.slice(0, 1)],
      ['every copy hidden', (ids: string[]) => ids],
    ] as const) {
      it(`${dims}D: a parent with ${label} keeps it hidden in the child`, () => {
        const pa = parent(dims, A, 2, DIH3)
        const hidden = hide(copies(pa).map(([tid]) => tid))
        for (const tid of hidden) {
          pa.transforms[tid as TransformId]!.visible = false
        }
        const pb = parent(dims, B, 2, ROT4)
        for (const child of breedFlames(pa, pb, {
          count: 3,
          crossoverMode: 'alternate',
        })) {
          expect(look(child)).toEqual(look(pa))
          expectChild(child, pa, pb)
          expect(
            copies(child)
              .filter(([, t]) => !t.visible)
              .map(([tid]) => tid),
          ).toEqual(hidden)
        }
      })
    }

    it(`${dims}D: a mirror-only parent gives the mirror`, () => {
      const pa = parent(dims, A, 3, { folds: 1, type: 'dihedral' })
      const pb = parent(dims, B, 2)
      for (const mode of CROSSOVER_MODES) {
        for (const child of breedFlames(pa, pb, {
          count: 6,
          crossoverMode: mode,
        })) {
          expectChild(child, pa, pb)
        }
      }
      const [child] = breedFlames(pa, pb, {
        count: 1,
        crossoverMode: 'alternate',
      })
      expect(setOf(child!)).toEqual({ folds: 1, type: 'dihedral' })
    })

    it(`${dims}D: a parent with only copies counts as empty`, () => {
      const pa = parent(dims, A, 2, DIH3)
      const onlyCopies = {
        ...parent(dims, B, 1, ROT4),
      }
      onlyCopies.transforms = Object.fromEntries(copies(onlyCopies))
      for (const child of breedFlames(pa, onlyCopies, { count: 3 })) {
        expectChild(child, pa, onlyCopies)
        expect(setOf(child)).toEqual(DIH3)
      }
    })

    it(`${dims}D: a single-parent breed keeps the copies verbatim`, () => {
      const pa = parent(dims, A, 3, DIH3)
      const [editedId, edited] = copies(pa)[0]!
      edited.preAffine = symmetryRotationPreAffine(1, dims === 3 ? '3D' : '2D')
      pa.transforms[copies(pa)[1]![0] as TransformId]!.visible = false
      expect(editedId).toMatch(/^_sym__/)
      const empty = { ...parent(dims, B, 1), transforms: {} }
      for (const child of breedFlames(pa, empty, {
        count: 3,
        mutationStrength: 1,
      })) {
        expect(users(child)).toHaveLength(3)
        expect(look(child)).toEqual(look(pa))
        expectChild(child, pa, empty)
      }
    })
  }

  it('still refuses parents of different dimensions', () => {
    expect(
      breedFlames(parent(2, A, 2, ROT4), parent(3, B, 2, DIH3), { count: 3 }),
    ).toEqual([])
  })
})
