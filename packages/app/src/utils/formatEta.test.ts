import { describe, expect, it } from 'vitest'
import { formatEta } from './formatEta'

describe('formatEta', () => {
  it('returns empty string for non-finite or non-positive input', () => {
    expect(formatEta(0)).toBe('')
    expect(formatEta(-5)).toBe('')
    expect(formatEta(Number.POSITIVE_INFINITY)).toBe('')
    expect(formatEta(Number.NaN)).toBe('')
  })

  it('formats sub-minute durations as seconds', () => {
    expect(formatEta(12)).toBe('12s remaining')
  })

  it('formats minutes and seconds', () => {
    expect(formatEta(125)).toBe('2m 5s remaining')
  })

  it('never emits "60s" by rounding the seconds remainder up to a full minute', () => {
    // 119.9s used to round to "1m 60s remaining" instead of carrying into minutes.
    expect(formatEta(119.9)).toBe('2m 0s remaining')
  })

  it('rounds an exact minute boundary correctly', () => {
    expect(formatEta(60)).toBe('1m 0s remaining')
  })
})
