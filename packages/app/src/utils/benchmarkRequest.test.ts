import { describe, expect, it } from 'vitest'
import { isBenchmarkAuto, isBenchmarkRequested } from './benchmarkRequest'

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

  it('treats =auto as both requested and auto-start', () => {
    expect(isBenchmarkRequested('?benchmark=auto')).toBe(true)
    expect(isBenchmarkAuto('?benchmark=auto')).toBe(true)
  })

  it('does not auto-start for a plain request', () => {
    expect(isBenchmarkAuto('?benchmark')).toBe(false)
    expect(isBenchmarkAuto('?benchmark=1')).toBe(false)
    expect(isBenchmarkAuto('')).toBe(false)
  })
})
