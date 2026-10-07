/**
 * One writer, same picture. Before the two symmetry writers shared
 * symmetry.ts's builders, each built its transforms itself: the
 * `flame.applySymmetry` command in the 2D key layout for every flame, and
 * `applySymmetryToFlame` with a 3D-layout preAffine and a 2D-layout
 * postAffine for a 3D flame. Both are kept below, verbatim, as the reference.
 *
 * For every fold count the command accepts, both types and both dimensions,
 * the uniforms the renderer builds from what each writer writes now equal
 * the uniforms it built from what that writer wrote before: the same
 * matrices, probabilities, colours and variation weights. So do the variation
 * types, which pick the shader code and are not in the uniforms. The one
 * intended change is a 1-fold dihedral set from applySymmetryToFlame, which is
 * now the mirror alone, as the command always wrote it.
 *
 * The bases have one transform of probability 1, and two transforms whose
 * probabilities sum to 0.6 and to 1.7: a symmetry transform's probability is
 * the other transforms' total, at least 1, so a base at exactly 1 cannot tell
 * the floor or the total from a constant.
 */
import { describe, expect, it } from 'vitest'
import { MAX_SYMMETRY_FOLDS } from '@/commands/builtins/flame/helpers'
import { executeCommand } from '@/commands/registry'
import { applySymmetryToFlame } from './symmetry'
import { bases, symIds, TYPES, workspace } from './symmetryTestUtils'
import { extractFlameUniforms } from './transformFunction'
import { extractFlameUniforms3D } from './transformFunction3D'
import type { SymmetryType } from './symmetryDetection'
import type { Dims } from './symmetryTestUtils'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

type Affine = Record<string, number>
type Written = { preAffine: Affine; postAffine: Affine }

/** What the command wrote before, for a 2D and a 3D flame alike. */
function commandBefore(folds: number, type: SymmetryType): Written[] {
  const identity = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
  const out: Written[] = []
  for (let i = 1; i < folds; i++) {
    const angle = (2 * Math.PI * i) / folds
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    out.push({
      preAffine: { a: cos, b: -sin, c: 0, d: sin, e: cos, f: 0 },
      postAffine: identity,
    })
  }
  if (type === 'dihedral') {
    out.push({
      preAffine: { a: -1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      postAffine: identity,
    })
  }
  return out
}

/** What applySymmetryToFlame wrote before. */
function symmetryTsBefore(
  folds: number,
  type: SymmetryType,
  is3D: boolean,
): Written[] {
  if (folds <= 1) return []
  const identity = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
  const out: Written[] = []
  for (let i = 1; i < folds; i++) {
    const angle = (2 * Math.PI * i) / folds
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const preAffine: Affine = is3D
      ? {
          a: cos,
          b: -sin,
          c: 0,
          d: 0,
          e: sin,
          f: cos,
          g: 0,
          h: 0,
          i: 0,
          j: 0,
          k: 1,
          l: 0,
        }
      : { a: cos, b: -sin, c: 0, d: sin, e: cos, f: 0 }
    out.push({ preAffine, postAffine: identity })
  }
  if (type === 'dihedral') {
    const preAffine: Affine = is3D
      ? {
          a: -1,
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
      : { a: -1, b: 0, c: 0, d: 0, e: 1, f: 0 }
    out.push({ preAffine, postAffine: identity })
  }
  return out
}

/**
 * `flame` with each `_sym__` transform replaced, in order, by the whole
 * transform the old writer built around `before`'s affines: the same fields,
 * values and variation it wrote (probability the other transforms' total,
 * at least 1; colour speed 0; colour 0, 0; visible; one linear variation of
 * weight 1). Only the ids are taken from the new flame.
 */
function withBefore(flame: FlameDescriptor, before: Written[]) {
  const ids = symIds(flame)
  expect(ids).toHaveLength(before.length)
  const copy = structuredClone(flame)
  const others = Object.entries(copy.transforms).filter(
    ([tid]) => !tid.startsWith('_sym__'),
  )
  const weight = Math.max(
    others.reduce((sum, [, t]) => sum + t.probability, 0),
    1,
  )
  const linear =
    flame.renderSettings.dimensions === 3 ? 'linear3D' : 'linearVar'
  ids.forEach((tid, index) => {
    const variationId = Object.keys(
      flame.transforms[tid as keyof typeof flame.transforms]!.variations,
    )[0]!
    copy.transforms[tid as keyof typeof copy.transforms] = {
      probability: weight,
      colorSpeed: 0,
      color: { x: 0, y: 0 },
      visible: true,
      preAffine: before[index]!.preAffine,
      postAffine: before[index]!.postAffine,
      variations: {
        [variationId]: { type: linear, weight: 1, visible: true },
      },
    } as unknown as FlameDescriptor['transforms'][keyof FlameDescriptor['transforms']]
  })
  return copy
}

/** What the renderer is given: the uniforms, and each variation's type. */
function picture(flame: FlameDescriptor) {
  const types = Object.fromEntries(
    Object.entries(flame.transforms).map(([tid, t]) => [
      tid,
      Object.values(t.variations).map((v) => v.type),
    ]),
  )
  return {
    uniforms:
      flame.renderSettings.dimensions === 3
        ? extractFlameUniforms3D(flame)
        : extractFlameUniforms(flame),
    types,
  }
}

/** `base` with its one transform repeated, at these probabilities. */
function spread(base: FlameDescriptor, probabilities: number[]) {
  const copy = structuredClone(base)
  const [tid, transform] = Object.entries(copy.transforms)[0]!
  const transforms: Record<string, unknown> = {}
  probabilities.forEach((probability, index) => {
    transforms[`${tid}${index}`] = { ...transform, probability }
  })
  copy.transforms = transforms as FlameDescriptor['transforms']
  return copy
}

const BASES: { name: string; base: (dims: Dims) => FlameDescriptor }[] = [
  { name: 'probability 1', base: (dims) => bases[dims] },
  {
    name: 'probabilities 0.6',
    base: (dims) => spread(bases[dims], [0.35, 0.25]),
  },
  {
    name: 'probabilities 1.7',
    base: (dims) => spread(bases[dims], [0.9, 0.8]),
  },
]

describe('the renderer sees what it saw before the writers became one', () => {
  for (const dims of [2, 3] as Dims[]) {
    for (const type of TYPES) {
      for (const { name, base } of BASES) {
        it(`${dims}D ${type}, the command, ${name}, folds 1-${MAX_SYMMETRY_FOLDS}`, () => {
          for (let folds = 1; folds <= MAX_SYMMETRY_FOLDS; folds++) {
            const ws = workspace(base(dims))
            executeCommand('flame.applySymmetry', ws.ctx, folds, type)
            const now = ws.flame()
            expect(picture(now)).toEqual(
              picture(withBefore(now, commandBefore(folds, type))),
            )
          }
        })

        it(`${dims}D ${type}, applySymmetryToFlame, ${name}, folds 1-${MAX_SYMMETRY_FOLDS}`, () => {
          for (let folds = 1; folds <= MAX_SYMMETRY_FOLDS; folds++) {
            const now = applySymmetryToFlame(base(dims), folds, type)
            if (folds === 1 && type === 'dihedral') {
              // The one intended change: D1 is the mirror alone now.
              expect(symmetryTsBefore(folds, type, dims === 3)).toEqual([])
              expect(picture(now)).toEqual(
                picture(withBefore(now, commandBefore(folds, type))),
              )
              continue
            }
            expect(picture(now)).toEqual(
              picture(
                withBefore(now, symmetryTsBefore(folds, type, dims === 3)),
              ),
            )
          }
        })
      }
    }
  }
})
