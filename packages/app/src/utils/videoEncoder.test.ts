import { describe, expect, it } from 'vitest'
import { computeReorderDelayUs } from './videoEncoder'

const FPS = 30
const grid = (i: number, fps = FPS) => Math.round((i * 1e6) / fps)

/** Offsets the muxing loop would produce — must never be negative. */
function compositionOffsets(ptsInDecodeOrder: number[], fps = FPS): number[] {
  const delay = computeReorderDelayUs(ptsInDecodeOrder, fps)
  return ptsInDecodeOrder.map((pts, d) => pts + delay - grid(d, fps))
}

describe('computeReorderDelayUs', () => {
  it('returns 0 for an empty stream', () => {
    expect(computeReorderDelayUs([], FPS)).toBe(0)
  })

  it('returns 0 for a monotonic stream (no B-frames), producing all-zero offsets', () => {
    const pts = [0, 1, 2, 3, 4].map((i) => grid(i))
    expect(computeReorderDelayUs(pts, FPS)).toBe(0)
    expect(compositionOffsets(pts)).toEqual([0, 0, 0, 0, 0])
  })

  it('handles a single B-frame reorder (I P B decode order)', () => {
    // Presentation order I0 B1 P2 → decode order I0 P2 B1
    const pts = [grid(0), grid(2), grid(1)]
    const delay = computeReorderDelayUs(pts, FPS)
    expect(delay).toBe(grid(2) - grid(1)) // one frame interval (rounded grid)
    for (const offset of compositionOffsets(pts)) {
      expect(offset).toBeGreaterThanOrEqual(0)
    }
    // The B-frame lands exactly on its decode slot (minimal delay).
    expect(compositionOffsets(pts)[2]).toBe(0)
  })

  it('handles two consecutive B-frames (I P B B decode order)', () => {
    // Presentation order I0 B1 B2 P3 → decode order I0 P3 B1 B2
    const pts = [grid(0), grid(3), grid(1), grid(2)]
    const delay = computeReorderDelayUs(pts, FPS)
    expect(delay).toBeGreaterThan(0)
    for (const offset of compositionOffsets(pts)) {
      expect(offset).toBeGreaterThanOrEqual(0)
    }
  })

  it('keeps offsets non-negative across repeating GOPs at 60fps', () => {
    // IPBB GOP repeated: decode order indices [0, 3, 1, 2, 4, 7, 5, 6, ...]
    const presentationOrder = [0, 3, 1, 2, 4, 7, 5, 6, 8, 11, 9, 10]
    const pts = presentationOrder.map((i) => grid(i, 60))
    for (const offset of compositionOffsets(pts, 60)) {
      expect(offset).toBeGreaterThanOrEqual(0)
    }
  })
})
