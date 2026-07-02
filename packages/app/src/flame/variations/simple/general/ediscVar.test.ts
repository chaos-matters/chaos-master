import { vec2f } from 'typegpu/data'
import { describe, expect, it } from 'vitest'
import { ediscVar } from './ediscVar'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const varInfo = { weight: 1, affineCoefs: {} } as any

describe('ediscVar', () => {
  it('produces finite output across the coordinate range, including the elliptic-coordinate boundary (xmax == 1) at the foci', () => {
    // The `xmax` computed from (x, y) is >= 1 for all real inputs, hitting
    // exactly 1 only at the foci (x = ±1, y = 0). `sqrt(xmax - 1)` and
    // `acos(x / xmax)` are only safe because of that invariant — on real
    // GPU f32 hardware, rounding error can push `xmax` a hair below 1 or
    // `x / xmax` a hair outside [-1, 1], which used to produce NaN before
    // both expressions were guarded (select/clamp) to match sibling
    // variations like ellipticVar/eModVar.
    const samples: [number, number][] = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0.5, 0.5],
      [-0.5, -0.5],
      [2, 3],
      [-4, 1.5],
      [0.999999, 0.000001],
      [-0.999999, -0.000001],
    ]
    for (const [x, y] of samples) {
      const out = ediscVar.fn(vec2f(x, y), varInfo)
      expect(Number.isFinite(out.x), `x=${x} y=${y} -> out.x`).toBe(true)
      expect(Number.isFinite(out.y), `x=${x} y=${y} -> out.y`).toBe(true)
    }
  })
})
