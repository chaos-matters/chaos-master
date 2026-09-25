/**
 * The symmetry order `calculateGroundedStats` reads from a flame's `_sym__`
 * transforms, and the stats that follow from it (DEF through the symmetry
 * multiplier, and Power), on real flames with each writer's symmetry.
 *
 * Radiant Symmetry ships with a 2D D4 dihedral set; Spiral Galaxy is a 3D
 * flame without one. Each gets 4- and 6-fold sets from both writers, and the
 * command's flame is also saved and loaded again.
 */
import { describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { calculateGroundedStats } from './stats'
import { applySymmetryToFlame } from './symmetry'
import { applySymmetry, reload, SOURCES, TYPES, workspace, } from './symmetryTestUtils'
import type { SymmetryType } from './symmetryDetection'
import type { Source } from './symmetryTestUtils'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

const FLAMES: { name: string; flame: FlameDescriptor }[] = [
  { name: 'Radiant Symmetry (2D)', flame: examples.example26 },
  { name: 'Spiral Galaxy (3D)', flame: examples.example37 },
]

function withSymmetry(
  flame: FlameDescriptor,
  type: SymmetryType,
  folds: number,
  source: Source,
): FlameDescriptor {
  if (source === 'symmetry.ts') return applySymmetryToFlame(flame, folds, type)
  const ws = workspace(flame)
  applySymmetry(ws.ctx, folds, type, 'add')
  return source === 'command' ? ws.flame() : reload(ws.flame())
}

function describeStats(flame: FlameDescriptor): string {
  const s = calculateGroundedStats(flame)
  return `order ${s.symmetryOrder}, DEF ${s.def}, Power ${s.powerLevel}`
}

describe('the symmetry order in the grounded stats', () => {
  it('pins it per flame, writer, type and fold count', () => {
    const rows: string[] = []
    for (const { name, flame } of FLAMES) {
      rows.push(`${name} as shipped: ${describeStats(flame)}`)
      for (const type of TYPES) {
        for (const folds of [4, 6]) {
          for (const source of SOURCES) {
            rows.push(
              `${name} ${type} ${folds} by ${source}: ${describeStats(withSymmetry(flame, type, folds, source))}`,
            )
          }
        }
      }
    }
    expect(rows).toEqual([
      'Radiant Symmetry (2D) as shipped: order 4, DEF 29, Power 1065',
      'Radiant Symmetry (2D) rotational 4 by symmetry.ts: order 4, DEF 29, Power 1061',
      'Radiant Symmetry (2D) rotational 4 by command: order 4, DEF 29, Power 1061',
      'Radiant Symmetry (2D) rotational 4 by command, reloaded: order 4, DEF 29, Power 1061',
      'Radiant Symmetry (2D) rotational 6 by symmetry.ts: order 6, DEF 36, Power 1084',
      'Radiant Symmetry (2D) rotational 6 by command: order 6, DEF 36, Power 1084',
      'Radiant Symmetry (2D) rotational 6 by command, reloaded: order 6, DEF 36, Power 1084',
      'Radiant Symmetry (2D) dihedral 4 by symmetry.ts: order 4, DEF 29, Power 1049',
      'Radiant Symmetry (2D) dihedral 4 by command: order 4, DEF 29, Power 1049',
      'Radiant Symmetry (2D) dihedral 4 by command, reloaded: order 4, DEF 29, Power 1049',
      'Radiant Symmetry (2D) dihedral 6 by symmetry.ts: order 6, DEF 36, Power 1056',
      'Radiant Symmetry (2D) dihedral 6 by command: order 6, DEF 36, Power 1056',
      'Radiant Symmetry (2D) dihedral 6 by command, reloaded: order 6, DEF 36, Power 1056',
      'Spiral Galaxy (3D) as shipped: order 2, DEF 34, Power 1270',
      'Spiral Galaxy (3D) rotational 4 by symmetry.ts: order 4, DEF 39, Power 1174',
      'Spiral Galaxy (3D) rotational 4 by command: order 4, DEF 39, Power 1174',
      'Spiral Galaxy (3D) rotational 4 by command, reloaded: order 4, DEF 39, Power 1174',
      'Spiral Galaxy (3D) rotational 6 by symmetry.ts: order 6, DEF 46, Power 1147',
      'Spiral Galaxy (3D) rotational 6 by command: order 6, DEF 46, Power 1147',
      'Spiral Galaxy (3D) rotational 6 by command, reloaded: order 6, DEF 46, Power 1147',
      'Spiral Galaxy (3D) dihedral 4 by symmetry.ts: order 4, DEF 37, Power 1124',
      'Spiral Galaxy (3D) dihedral 4 by command: order 4, DEF 37, Power 1124',
      'Spiral Galaxy (3D) dihedral 4 by command, reloaded: order 4, DEF 37, Power 1124',
      'Spiral Galaxy (3D) dihedral 6 by symmetry.ts: order 6, DEF 45, Power 1118',
      'Spiral Galaxy (3D) dihedral 6 by command: order 6, DEF 45, Power 1118',
      'Spiral Galaxy (3D) dihedral 6 by command, reloaded: order 6, DEF 45, Power 1118',
    ])
  })
})

describe('the symmetry order is the fold count of the set', () => {
  for (const { name, flame } of FLAMES) {
    for (const source of SOURCES) {
      it(`${name} by ${source}, folds 1-8`, () => {
        for (const type of TYPES) {
          for (let folds = 1; folds <= 8; folds++) {
            // A 1-fold rotational set is no set: the order comes from the
            // flame's own transforms then.
            if (type === 'rotational' && folds === 1) continue
            const withSet = withSymmetry(flame, type, folds, source)
            expect([
              type,
              folds,
              calculateGroundedStats(withSet).symmetryOrder,
            ]).toEqual([type, folds, folds])
          }
        }
      })
    }
  }

  it('counts only the visible transforms of the set', () => {
    const flame = withSymmetry(examples.example26, 'dihedral', 4, 'command')
    const ids = Object.keys(flame.transforms).filter((tid) =>
      tid.startsWith('_sym__'),
    )
    const hide = (tids: string[]) => {
      const copy = structuredClone(flame)
      for (const tid of tids) {
        copy.transforms[tid as keyof typeof copy.transforms]!.visible = false
      }
      return calculateGroundedStats(copy).symmetryOrder
    }
    // The mirror is written last: hiding it leaves a 4-fold rotational set.
    expect(hide([ids[3]!])).toBe(4)
    // Hiding a rotation leaves two rotations and the mirror: dihedral 3.
    expect(hide([ids[0]!])).toBe(3)
  })
})
