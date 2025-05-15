import { describe, expect, it } from 'vitest'
import {
  compressPatches,
  forwardBackwardPatchPairDoesNothing,
} from './compressPatches'
import type { Patch } from 'structurajs'

describe('compressPatches', () => {
  it('removes repeating replace patches', () => {
    const patches: Patch[] = [
      { op: 'replace', path: ['a', 'b', 'c'], value: 5 },
      { op: 'replace', path: ['a', 'b', 'c'], value: 6 },
      { op: 'replace', path: ['a', 'b', 'c'], value: 7 },
      { op: 'replace', path: ['a', 'b', 'c'], value: 8 },
    ]
    expect(compressPatches(patches)).toEqual([
      {
        op: 'replace',
        path: ['a', 'b', 'c'],
        value: 8,
      },
    ])
  })

  it('does nothing for []', () => {
    expect(compressPatches([])).toEqual([])
  })

  it('keeps unrelated patches', () => {
    const patches: Patch[] = [
      { op: 'replace', path: ['a', 'b', 'b'], value: 0 },
      { op: 'replace', path: ['a', 'b', 'c'], value: 6 },
      { op: 'replace', path: ['a', 'b', 'c'], value: 7 },
      { op: 'replace', path: ['a', 'b', 'c'], value: 8 },
    ]
    expect(compressPatches(patches)).toEqual([
      {
        op: 'replace',
        path: ['a', 'b', 'b'],
        value: 0,
      },
      {
        op: 'replace',
        path: ['a', 'b', 'c'],
        value: 8,
      },
    ])
  })
})

describe('forwardBackwardPatchPairDoesNothing', () => {
  it('works in the basic case', () => {
    expect(
      forwardBackwardPatchPairDoesNothing(
        [{ op: 'replace', path: ['a'], value: 3 }],
        [{ op: 'replace', path: ['a'], value: 3 }],
      ),
    ).toBe(true)
    expect(
      forwardBackwardPatchPairDoesNothing(
        [{ op: 'replace', path: ['a'], value: 3 }],
        [{ op: 'replace', path: ['a'], value: 4 }],
      ),
    ).toBe(false)
  })

  it(`ignores changes which are not 'replace'`, () => {
    expect(
      forwardBackwardPatchPairDoesNothing(
        [{ op: 'add', path: ['a'], value: 3 }],
        [{ op: 'add', path: ['a'], value: 3 }],
      ),
    ).toBe(false)
  })
})
