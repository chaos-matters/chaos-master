import { describe, expect, it } from 'vitest'
import { isBenchmarksPath } from './appPath'

describe('isBenchmarksPath', () => {
  it.each(['/benchmarks', '/benchmarks/'])('matches %s', (pathname) => {
    expect(isBenchmarksPath(pathname)).toBe(true)
  })

  it.each(['/', '/benchmark', '/benchmarks/history', '/BENCHMARKS'])(
    'does not match %s',
    (pathname) => {
      expect(isBenchmarksPath(pathname)).toBe(false)
    },
  )
})
