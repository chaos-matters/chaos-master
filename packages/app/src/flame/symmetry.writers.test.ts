/**
 * What the two symmetry writers put into a flame: `applySymmetryToFlame`
 * (symmetry.ts) and the `flame.applySymmetry` command.
 *
 * Each row names the transforms a writer adds, the key layout of their pre-
 * and postAffines, and what the renderer does with each preAffine: `R<deg>`
 * for a rotation about z by that angle, `M` for the x mirror.
 */
import { describe, expect, it } from 'vitest'
import { affineLayout } from './symmetryDetection'
import { build, reload, renderedDeterminant, renderedPreAffine, SOURCES, symIds, TYPES, } from './symmetryTestUtils'
import type { Dims } from './symmetryTestUtils'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

const round = (v: number) => {
  const r = Math.round(v * 1e6) / 1e6
  return r === 0 ? 0 : r
}

/** A rendered preAffine as `R<deg>`, `M`, or its rows when it is neither. */
function renderedName(rows: number[][]): string {
  const [[a, b, c, tx], [e, f, g, ty], [i, j, k, tz]] = rows as [
    number[],
    number[],
    number[],
  ]
  const zAxisFixed =
    round(c!) === 0 &&
    round(g!) === 0 &&
    round(i!) === 0 &&
    round(j!) === 0 &&
    round(k!) === 1
  const still = round(tx!) === 0 && round(ty!) === 0 && round(tz!) === 0
  if (zAxisFixed && still) {
    if (round(a! - f!) === 0 && round(b! + e!) === 0) {
      const deg = (Math.atan2(e!, a!) * 180) / Math.PI
      return `R${round((deg + 360) % 360)}`
    }
    if (
      round(a!) === -1 &&
      round(b!) === 0 &&
      round(e!) === 0 &&
      round(f!) === 1
    )
      return 'M'
  }
  return JSON.stringify(rows.map((row) => row.map(round)))
}

function layouts(flame: FlameDescriptor, key: 'preAffine' | 'postAffine') {
  const found = new Set(
    symIds(flame).map((tid) =>
      affineLayout(
        flame.transforms[tid as keyof typeof flame.transforms]![key] as Record<
          string,
          number
        >,
      ),
    ),
  )
  return found.size === 0 ? '-' : [...found].join('+')
}

function describeWrite(flame: FlameDescriptor): string {
  const ids = symIds(flame)
  const variations = new Set(
    ids.flatMap((tid) =>
      Object.values(
        flame.transforms[tid as keyof typeof flame.transforms]!.variations,
      ).map((v) => v.type),
    ),
  )
  const rendered = ids
    .map((tid) => renderedName(renderedPreAffine(flame, tid)))
    .join(' ')
  return `${ids.length} transforms, pre ${layouts(flame, 'preAffine')}, post ${layouts(flame, 'postAffine')}, ${[...variations].join('+') || '-'}: ${rendered || '-'}`
}

describe('the two symmetry writers', () => {
  it('pins what each writes, and what loading it back leaves, 2D and 3D, folds 1, 2 and 4', () => {
    const rows: string[] = []
    for (const dims of [2, 3] as Dims[]) {
      for (const type of TYPES) {
        for (const folds of [1, 2, 4]) {
          for (const source of SOURCES) {
            rows.push(
              `${dims}D ${type} ${folds} by ${source}: ${describeWrite(build(dims, type, folds, source))}`,
            )
          }
        }
      }
    }
    expect(rows).toEqual([
      '2D rotational 1 by symmetry.ts: 0 transforms, pre -, post -, -: -',
      '2D rotational 1 by command: 0 transforms, pre -, post -, -: -',
      '2D rotational 1 by command, reloaded: 0 transforms, pre -, post -, -: -',
      '2D rotational 2 by symmetry.ts: 1 transforms, pre 2D, post 2D, linearVar: R180',
      '2D rotational 2 by command: 1 transforms, pre 2D, post 2D, linearVar: R180',
      '2D rotational 2 by command, reloaded: 1 transforms, pre 2D, post 2D, linearVar: R180',
      '2D rotational 4 by symmetry.ts: 3 transforms, pre 2D, post 2D, linearVar: R90 R180 R270',
      '2D rotational 4 by command: 3 transforms, pre 2D, post 2D, linearVar: R90 R180 R270',
      '2D rotational 4 by command, reloaded: 3 transforms, pre 2D, post 2D, linearVar: R90 R180 R270',
      '2D dihedral 1 by symmetry.ts: 1 transforms, pre 2D, post 2D, linearVar: M',
      '2D dihedral 1 by command: 1 transforms, pre 2D, post 2D, linearVar: M',
      '2D dihedral 1 by command, reloaded: 1 transforms, pre 2D, post 2D, linearVar: M',
      '2D dihedral 2 by symmetry.ts: 2 transforms, pre 2D, post 2D, linearVar: R180 M',
      '2D dihedral 2 by command: 2 transforms, pre 2D, post 2D, linearVar: R180 M',
      '2D dihedral 2 by command, reloaded: 2 transforms, pre 2D, post 2D, linearVar: R180 M',
      '2D dihedral 4 by symmetry.ts: 4 transforms, pre 2D, post 2D, linearVar: R90 R180 R270 M',
      '2D dihedral 4 by command: 4 transforms, pre 2D, post 2D, linearVar: R90 R180 R270 M',
      '2D dihedral 4 by command, reloaded: 4 transforms, pre 2D, post 2D, linearVar: R90 R180 R270 M',
      '3D rotational 1 by symmetry.ts: 0 transforms, pre -, post -, -: -',
      '3D rotational 1 by command: 0 transforms, pre -, post -, -: -',
      '3D rotational 1 by command, reloaded: 0 transforms, pre -, post -, -: -',
      '3D rotational 2 by symmetry.ts: 1 transforms, pre 3D, post 3D, linear3D: R180',
      '3D rotational 2 by command: 1 transforms, pre 3D, post 3D, linear3D: R180',
      '3D rotational 2 by command, reloaded: 1 transforms, pre 3D, post 3D, linear3D: R180',
      '3D rotational 4 by symmetry.ts: 3 transforms, pre 3D, post 3D, linear3D: R90 R180 R270',
      '3D rotational 4 by command: 3 transforms, pre 3D, post 3D, linear3D: R90 R180 R270',
      '3D rotational 4 by command, reloaded: 3 transforms, pre 3D, post 3D, linear3D: R90 R180 R270',
      '3D dihedral 1 by symmetry.ts: 1 transforms, pre 3D, post 3D, linear3D: M',
      '3D dihedral 1 by command: 1 transforms, pre 3D, post 3D, linear3D: M',
      '3D dihedral 1 by command, reloaded: 1 transforms, pre 3D, post 3D, linear3D: M',
      '3D dihedral 2 by symmetry.ts: 2 transforms, pre 3D, post 3D, linear3D: R180 M',
      '3D dihedral 2 by command: 2 transforms, pre 3D, post 3D, linear3D: R180 M',
      '3D dihedral 2 by command, reloaded: 2 transforms, pre 3D, post 3D, linear3D: R180 M',
      '3D dihedral 4 by symmetry.ts: 4 transforms, pre 3D, post 3D, linear3D: R90 R180 R270 M',
      '3D dihedral 4 by command: 4 transforms, pre 3D, post 3D, linear3D: R90 R180 R270 M',
      '3D dihedral 4 by command, reloaded: 4 transforms, pre 3D, post 3D, linear3D: R90 R180 R270 M',
    ])
  })

  it('no mirror is written with a positive determinant, nor a rotation with a negative one', () => {
    for (const dims of [2, 3] as Dims[]) {
      for (const type of TYPES) {
        for (const source of ['symmetry.ts', 'command'] as const) {
          const flame = build(dims, type, 4, source)
          const determinants = symIds(flame).map((tid) =>
            round(renderedDeterminant(renderedPreAffine(flame, tid))),
          )
          expect(determinants).toEqual(
            type === 'dihedral' ? [1, 1, 1, -1] : [1, 1, 1],
          )
        }
      }
    }
  })

  it('writes transforms a save and load leave as they are', () => {
    for (const dims of [2, 3] as Dims[]) {
      for (const type of TYPES) {
        for (const folds of [1, 2, 3, 4, 7]) {
          for (const source of ['symmetry.ts', 'command'] as const) {
            const written = build(dims, type, folds, source)
            const loaded = reload(written)
            const pick = (flame: FlameDescriptor) =>
              symIds(flame).map(
                (tid) => flame.transforms[tid as keyof typeof flame.transforms],
              )
            expect(pick(loaded)).toEqual(pick(written))
          }
        }
      }
    }
  })
})
