import { describe, expect, it } from 'vitest'
import { parsePick } from '../../scripts/sequence-pick.mjs'

/*
 * `--pick` decides which previewed candidates get written to the Home gallery.
 *
 * It is worth testing on its own because the failure is silent and durable: an
 * off-by-one here does not throw, it publishes a flame nobody looked at, and
 * the only way to notice is to spot it on Home later.
 */
describe('parsePick', () => {
  it('keeps the order it was given, not sorted order', () => {
    // The walk plays in sequence, so 2,0,1 is a different piece from 0,1,2.
    expect(parsePick('2,0,1', 4)).toEqual([2, 0, 1])
  })

  it('keeps repeats — revisiting a flame is a legitimate walk', () => {
    expect(parsePick('0,2,0', 3)).toEqual([0, 2, 0])
  })

  it('tolerates the spacing a human types', () => {
    expect(parsePick(' 1 , 3 ', 4)).toEqual([1, 3])
    expect(parsePick('1,,2', 4)).toEqual([1, 2])
  })

  it('accepts the whole range, including the last index', () => {
    expect(parsePick('0,3', 4)).toEqual([0, 3])
  })

  it('refuses an index past the end rather than dropping it', () => {
    // Dropping it would write a shorter walk than asked for and say nothing.
    expect(() => parsePick('0,4', 4)).toThrow(/out of range/)
    expect(() => parsePick('-1', 4)).toThrow(/out of range/)
  })

  it('refuses anything that is not a whole index', () => {
    expect(() => parsePick('1.5', 4)).toThrow(/out of range/)
    expect(() => parsePick('two', 4)).toThrow(/out of range/)
  })

  it('refuses an empty selection instead of clearing the row', () => {
    // An empty --pick must not read as "keep nothing" — clearing a sequence is
    // what --clear is for, and doing it by accident loses curation work.
    expect(() => parsePick('', 4)).toThrow(/at least one index/)
    expect(() => parsePick('  ,  ', 4)).toThrow(/at least one index/)
  })

  it('explains how many candidates there actually were', () => {
    // The hint is the whole reason the error is actionable.
    try {
      parsePick('9', 4)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as { hint?: string }).hint).toContain('0..3')
    }
  })
})
