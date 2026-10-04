import { describe, expect, it } from 'vitest'
import { layoutOrbitUpload } from './orbitUpload'
import type { GpuOrbit } from './orbitProtocol'

function orbit(length: number, levelCounts: number[], start = 1): GpuOrbit {
  let offset = 0
  const levels = levelCounts.map((count, i) => {
    const level = { offset, count, steps: 2 ** (3 + i) }
    offset += count
    return level
  })
  return {
    data: new ArrayBuffer(16 * length),
    length,
    escaped: true,
    bla: {
      data: new ArrayBuffer(32 * offset),
      levels,
      minLevel: 3,
      start,
      entryCount: offset,
    },
  }
}

describe('layoutOrbitUpload', () => {
  it('uses the one orbit for both slots when there is no critical orbit', () => {
    const upload = layoutOrbitUpload({ main: orbit(100, [12, 6, 3]) })
    expect(upload.orbitEntries).toBe(100)
    expect(upload.blaEntries).toBe(21)
    expect(upload.info.orbit1).toEqual(upload.info.orbit0)
    expect(Array.from(upload.levels.slice(0, 6))).toEqual([0, 12, 12, 6, 18, 3])
  })

  it('rebases the second orbit behind the first', () => {
    const upload = layoutOrbitUpload({
      main: orbit(100, [12, 6], 0),
      critical: orbit(40, [5, 2], 1),
    })
    expect(upload.orbitEntries).toBe(140)
    expect(upload.blaEntries).toBe(18 + 7)
    expect(upload.writes.map((w) => [w.orbitBase, w.blaBase])).toEqual([
      [0, 0],
      [100, 18],
    ])
    expect(upload.info.orbit1).toMatchObject({
      base: 100,
      length: 40,
      blaStart: 1,
      levelBase: 2,
    })
    // The critical orbit's levels start after the main table's 18 entries.
    expect(Array.from(upload.levels.slice(4, 8))).toEqual([18, 5, 23, 2])
  })

  it('keeps an entry for an orbit without a table', () => {
    const upload = layoutOrbitUpload({
      main: orbit(10, []),
      critical: orbit(10, [4]),
    })
    expect(upload.blaEntries).toBe(1 + 4)
    expect(upload.info.orbit0.levelCount).toBe(0)
    expect(Array.from(upload.levels.slice(0, 2))).toEqual([1, 4])
  })
})
