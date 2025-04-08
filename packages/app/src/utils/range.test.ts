import { describe, expect, it } from 'vitest'
import { range } from './range'

describe('range', () => {
  it('should work for 0 length', () => {
    expect(range(0)).toEqual([])
  })

  it('should work for N length', () => {
    expect(range(1)).toEqual([0])
    expect(range(5)).toEqual([0, 1, 2, 3, 4])
  })
})
