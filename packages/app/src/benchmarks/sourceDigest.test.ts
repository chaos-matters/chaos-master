import { describe, expect, it } from 'vitest'
import { benchmarkSourceDigest } from './sourceDigest'

describe('benchmarkSourceDigest', () => {
  it('normalizes line endings and outer whitespace', () => {
    const compiler = 'safe-custom-variation/v1'
    expect(benchmarkSourceDigest('  return pos;\r\n', compiler)).toBe(
      benchmarkSourceDigest('return pos;\n', compiler),
    )
  })

  it('changes when either source or compiler contract changes', () => {
    const digest = benchmarkSourceDigest(
      'return pos;',
      'safe-custom-variation/v1',
    )
    expect(digest).toMatch(/^cm-custom-source-v1:[0-9a-f]{16}$/)
    expect(
      benchmarkSourceDigest('return -pos;', 'safe-custom-variation/v1'),
    ).not.toBe(digest)
    expect(
      benchmarkSourceDigest('return pos;', 'safe-custom-variation/v2'),
    ).not.toBe(digest)
  })
})
