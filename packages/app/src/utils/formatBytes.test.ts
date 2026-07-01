import { describe, expect, it } from 'vitest'
import { formatBytes } from './formatBytes'

describe('formatBytes', () => {
  it('formats zero', () => {
    expect(formatBytes(0)).toBe('0 Bytes')
  })

  it('formats whole kilobytes/megabytes', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1024 * 1024)).toBe('1 MB')
  })

  it('does not index past the sizes table for sub-1-byte values', () => {
    // log(0.5) / log(1024) is negative, which used to index sizes[-1].
    expect(formatBytes(0.5)).toBe('0.5 Bytes')
  })

  it('clamps to the largest known unit instead of indexing out of bounds', () => {
    const veryLarge = 1024 ** 10 // one order of magnitude past YB
    expect(formatBytes(veryLarge)).toMatch(/YB$/)
  })

  it('throws for negative input', () => {
    expect(() => formatBytes(-1)).toThrow()
  })
})
