import { describe, expect, it } from 'vitest'
import { isBenchmarkRequested } from './benchmarkRequest'

describe('isBenchmarkRequested', () => {
  it('opts in when the param is present', () => {
    expect(isBenchmarkRequested('?benchmark')).toBe(true)
    expect(isBenchmarkRequested('?benchmark=1')).toBe(true)
    expect(isBenchmarkRequested('?benchmark=true')).toBe(true)
    expect(isBenchmarkRequested('?foo=bar&benchmark=')).toBe(true)
  })

  it('opts out when absent or explicitly disabled', () => {
    expect(isBenchmarkRequested('')).toBe(false)
    expect(isBenchmarkRequested('?foo=bar')).toBe(false)
    expect(isBenchmarkRequested('?benchmark=0')).toBe(false)
    expect(isBenchmarkRequested('?benchmark=false')).toBe(false)
  })
})
