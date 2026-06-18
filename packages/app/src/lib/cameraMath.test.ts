import { describe, expect, it } from 'vitest'
import { vec3 } from 'wgpu-matrix'
import { cameraBasis, rollAdjustLookDelta, rolledUpVector } from './cameraMath'

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) =>
  a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
const len = (a: ArrayLike<number>) => Math.sqrt(dot(a, a))

describe('cameraBasis', () => {
  it('roll=0 gives ~world-up for a horizontal forward (unchanged camera)', () => {
    const { up, right, forward } = cameraBasis(vec3.fromValues(0, 0, -1), 0)
    expect(up[0]!).toBeCloseTo(0)
    expect(up[1]!).toBeCloseTo(1)
    expect(up[2]!).toBeCloseTo(0)
    // right is screen-right (+x) for a -z forward
    expect(right[0]!).toBeCloseTo(1)
    expect(forward[2]!).toBeCloseTo(-1)
  })

  it('returns an orthonormal basis at any roll', () => {
    const { right, up, forward } = cameraBasis(
      vec3.fromValues(0.3, -0.5, -1),
      1,
    )
    for (const v of [right, up, forward]) expect(len(v)).toBeCloseTo(1)
    expect(dot(right, up)).toBeCloseTo(0)
    expect(dot(right, forward)).toBeCloseTo(0)
    expect(dot(up, forward)).toBeCloseTo(0)
  })

  it('roll rotates up toward right (continuous, periodic)', () => {
    const f = vec3.fromValues(0, 0, -1)
    const up0 = rolledUpVector(f, 0)
    const upQuarter = rolledUpVector(f, Math.PI / 2)
    // After a quarter roll, up should be ~perpendicular to the original up.
    expect(dot(up0, upQuarter)).toBeCloseTo(0)
    // A full turn returns to start.
    const upFull = rolledUpVector(f, Math.PI * 2)
    expect(dot(up0, upFull)).toBeCloseTo(1)
  })

  it('handles looking straight down without degenerating', () => {
    const { right, up, forward } = cameraBasis(vec3.fromValues(0, -1, 0), 0)
    for (const v of [right, up, forward]) expect(len(v)).toBeCloseTo(1)
    expect(dot(right, up)).toBeCloseTo(0)
    expect(dot(up, forward)).toBeCloseTo(0)
  })
})

describe('rollAdjustLookDelta', () => {
  it('is the identity at roll = 0 ({ dRight: dx, dUp: -dy })', () => {
    const r = rollAdjustLookDelta(7, 3, 0)
    expect(r.dRight).toBeCloseTo(7)
    expect(r.dUp).toBeCloseTo(-3)
  })

  it('at 90° roll, horizontal mouse drives pitch and vertical drives yaw', () => {
    // c=0, s=1 → dRight = dy, dUp = dx
    const r = rollAdjustLookDelta(5, 0, Math.PI / 2)
    expect(r.dRight).toBeCloseTo(0) // no yaw from horizontal move
    expect(r.dUp).toBeCloseTo(5) // horizontal move becomes pitch
  })

  it('preserves the magnitude of the delta (pure rotation)', () => {
    const dx = 4
    const dy = -9
    const mag = Math.hypot(dx, dy)
    for (const roll of [0.3, 1, 2.5, -1.2]) {
      const r = rollAdjustLookDelta(dx, dy, roll)
      expect(Math.hypot(r.dRight, r.dUp)).toBeCloseTo(mag)
    }
  })
})
