import { describe, expect, it } from 'vitest'
import { DEFAULT_SEAT, isSeatId, SEAT_IDS } from './seatId'

describe('seatId', () => {
  it('names the player seat as the default and knows both seats', () => {
    expect(DEFAULT_SEAT).toBe('player')
    expect(SEAT_IDS).toEqual(['player', 'rival'])
    expect(isSeatId('rival')).toBe(true)
    expect(isSeatId('judge')).toBe(false)
    expect(isSeatId(undefined)).toBe(false)
  })
})
