/**
 * What the Symmetry card reads back from a flame, and what it rebuilds when
 * its Folds input changes.
 *
 * The card shows `detectSymmetryType` and `detectSymmetryFolds` over the
 * flame's `_sym__` transforms. Its Folds input (TransformsSection) rounds the
 * value, and when it differs from the shown fold count it runs
 * `flame.applySymmetry` with the new count and the shown type, which deletes
 * every `_sym__` transform and writes a fresh set. So a type the card reads
 * wrongly is a type the fold change writes wrongly.
 *
 * A flame gets its symmetry transforms from one of two writers, in 2D or 3D:
 * `applySymmetryToFlame` (symmetry.ts, behind Flame Clash's C1-C8 buttons)
 * and the `flame.applySymmetry` command (the card itself, and agents). A 3D
 * flame that is saved and loaded again has every 2D-layout affine promoted to
 * the 3D layout (`migrateFlameVariationTypes` in core), so that is a third
 * source.
 */
import { describe, expect, it } from 'vitest'
import { MAX_SYMMETRY_FOLDS } from '@/commands/builtins/flame/helpers'
import { detectSymmetryFolds, detectSymmetryType, isSymmetryMirror, } from './symmetryDetection'
import { applySymmetry, build, renderedMirrors, SOURCES, symTransforms, TYPES, workspace, } from './symmetryTestUtils'
import type { SymmetryType } from './symmetryDetection'
import type { Dims, Source, Workspace } from './symmetryTestUtils'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/** The Folds input's `onInput` in TransformsSection. */
function scrubFolds(ws: Workspace, value: number) {
  const syms = symTransforms(ws.flame())
  const newN = Math.max(2, Math.round(value))
  if (newN !== detectSymmetryFolds(syms)) {
    applySymmetry(ws.ctx, newN, detectSymmetryType(syms), 'folds')
  }
}

function describeCard(flame: FlameDescriptor) {
  const syms = symTransforms(flame)
  return `${detectSymmetryType(syms)} ${detectSymmetryFolds(syms)} (${syms.length} transforms, ${renderedMirrors(flame)} mirror)`
}

describe('the Symmetry card across a fold change, 4 to 6', () => {
  it('pins what the card reads before and after, per writer', () => {
    const rows: string[] = []
    for (const dims of [2, 3] as const) {
      for (const type of TYPES) {
        for (const source of SOURCES) {
          const ws = workspace(build(dims, type, 4, source))
          const before = describeCard(ws.flame())
          scrubFolds(ws, 6)
          rows.push(
            `${dims}D ${type} by ${source}: ${before} -> ${describeCard(ws.flame())}`,
          )
        }
      }
    }
    expect(rows).toEqual([
      '2D rotational by symmetry.ts: rotational 4 (3 transforms, 0 mirror) -> rotational 6 (5 transforms, 0 mirror)',
      '2D rotational by command: rotational 4 (3 transforms, 0 mirror) -> rotational 6 (5 transforms, 0 mirror)',
      '2D rotational by command, reloaded: rotational 4 (3 transforms, 0 mirror) -> rotational 6 (5 transforms, 0 mirror)',
      '2D dihedral by symmetry.ts: dihedral 4 (4 transforms, 1 mirror) -> dihedral 6 (6 transforms, 1 mirror)',
      '2D dihedral by command: dihedral 4 (4 transforms, 1 mirror) -> dihedral 6 (6 transforms, 1 mirror)',
      '2D dihedral by command, reloaded: dihedral 4 (4 transforms, 1 mirror) -> dihedral 6 (6 transforms, 1 mirror)',
      '3D rotational by symmetry.ts: rotational 4 (3 transforms, 0 mirror) -> rotational 6 (5 transforms, 0 mirror)',
      '3D rotational by command: rotational 4 (3 transforms, 0 mirror) -> rotational 6 (5 transforms, 0 mirror)',
      '3D rotational by command, reloaded: rotational 4 (3 transforms, 0 mirror) -> rotational 6 (5 transforms, 0 mirror)',
      '3D dihedral by symmetry.ts: dihedral 4 (4 transforms, 1 mirror) -> dihedral 6 (6 transforms, 1 mirror)',
      '3D dihedral by command: dihedral 4 (4 transforms, 1 mirror) -> dihedral 6 (6 transforms, 1 mirror)',
      '3D dihedral by command, reloaded: dihedral 4 (4 transforms, 1 mirror) -> dihedral 6 (6 transforms, 1 mirror)',
    ])
  })
})

describe('a dihedral flame keeps its mirror when the folds change', () => {
  for (const dims of [2, 3] as const) {
    for (const source of SOURCES) {
      it(`${dims}D, written by ${source}`, () => {
        const ws = workspace(build(dims, 'dihedral', 4, source))
        expect(renderedMirrors(ws.flame())).toBe(1)

        scrubFolds(ws, 6)

        const syms = symTransforms(ws.flame())
        expect(renderedMirrors(ws.flame())).toBe(1)
        expect(syms).toHaveLength(6)
        expect(detectSymmetryType(syms)).toBe('dihedral')
        expect(detectSymmetryFolds(syms)).toBe(6)
      })
    }
  }
})

/** The Type select's `onChange` in TransformsSection. */
function pickType(ws: Workspace, type: SymmetryType) {
  const syms = symTransforms(ws.flame())
  applySymmetry(ws.ctx, detectSymmetryFolds(syms), type, 'type')
}

describe('the Type select keeps the fold count', () => {
  for (const dims of [2, 3] as const) {
    for (const source of SOURCES) {
      for (const [from, to] of [
        ['dihedral', 'rotational'],
        ['rotational', 'dihedral'],
      ] as const) {
        it(`${dims}D ${from} to ${to}, written by ${source}`, () => {
          const ws = workspace(build(dims, from, 4, source))
          pickType(ws, to)
          const syms = symTransforms(ws.flame())
          expect(detectSymmetryType(syms)).toBe(to)
          expect(detectSymmetryFolds(syms)).toBe(4)
          expect(renderedMirrors(ws.flame())).toBe(to === 'dihedral' ? 1 : 0)
        })
      }
    }
  }
})

type Affine = Record<string, number | undefined>

function preAffines(flame: FlameDescriptor): Affine[] {
  return symTransforms(flame).map((t) => t.preAffine as Affine)
}

/**
 * The mirror each writer adds, found as the one preAffine its dihedral set
 * has and its rotational set of the same fold count does not.
 */
function writtenMirror(dims: Dims, folds: number, source: Source): Affine {
  const rotations = preAffines(build(dims, 'rotational', folds, source))
  const extra = preAffines(build(dims, 'dihedral', folds, source)).filter(
    (affine) =>
      !rotations.some((r) => JSON.stringify(r) === JSON.stringify(affine)),
  )
  expect(extra).toHaveLength(1)
  return extra[0]!
}

describe('isSymmetryMirror accepts the mirror each writer writes, and nothing else', () => {
  for (const dims of [2, 3] as const) {
    for (const source of SOURCES) {
      it(`${dims}D, written by ${source}: folds 2-8`, () => {
        for (let folds = 2; folds <= 8; folds++) {
          expect(isSymmetryMirror(writtenMirror(dims, folds, source))).toBe(
            true,
          )
          const dihedral = symTransforms(build(dims, 'dihedral', folds, source))
          expect(detectSymmetryType(dihedral)).toBe('dihedral')
          expect(detectSymmetryFolds(dihedral)).toBe(folds)
        }
      })

      it(`${dims}D, written by ${source}: no rotation reads as the mirror, folds 2-${MAX_SYMMETRY_FOLDS}`, () => {
        for (let folds = 2; folds <= MAX_SYMMETRY_FOLDS; folds++) {
          const rotational = build(dims, 'rotational', folds, source)
          expect(preAffines(rotational).filter(isSymmetryMirror)).toEqual([])
          expect(detectSymmetryType(symTransforms(rotational))).toBe(
            'rotational',
          )
          expect(detectSymmetryFolds(symTransforms(rotational))).toBe(folds)
        }
      })
    }
  }

  // Which keys are the translation is the key layout itself: 2D
  // x' = a x + b y + c, y' = d x + e y + f; 3D rows a b c d / e f g h /
  // i j k l, the last of each row the translation.
  const layouts = [
    { name: '2D', dims: 2 as const, translation: ['c', 'f'] },
    { name: '3D', dims: 3 as const, translation: ['d', 'h', 'l'] },
  ]
  for (const { name, dims, translation } of layouts) {
    it(`${name} layout: every linear coefficient is checked, the translation is not`, () => {
      const mirror = writtenMirror(dims, 4, 'symmetry.ts')
      for (const key of Object.keys(mirror)) {
        const moved = { ...mirror, [key]: mirror[key]! + 0.5 }
        expect([key, isSymmetryMirror(moved)]).toEqual([
          key,
          translation.includes(key),
        ])
      }
    })
  }

  it('reads nothing into a missing affine or no transforms', () => {
    expect(isSymmetryMirror(undefined)).toBe(false)
    expect(detectSymmetryType([])).toBe('rotational')
    expect(detectSymmetryFolds([])).toBe(1)
  })
})
