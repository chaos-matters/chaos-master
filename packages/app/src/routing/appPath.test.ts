import { describe, expect, it } from 'vitest'
import { isBenchmarksPath, isExplorerPath, PAGE_ROUTES, pageRouteOf, } from './appPath'

describe('isBenchmarksPath', () => {
  it.each(['/benchmarks', '/benchmarks/', '/benchmarks/index.html'])(
    'matches %s',
    (pathname) => {
      expect(isBenchmarksPath(pathname)).toBe(true)
    },
  )

  it.each(['/', '/benchmark', '/benchmarks/history', '/BENCHMARKS'])(
    'does not match %s',
    (pathname) => {
      expect(isBenchmarksPath(pathname)).toBe(false)
    },
  )
})

describe('isExplorerPath', () => {
  it.each(['/explore', '/explore/', '/explore/index.html'])(
    'matches %s',
    (pathname) => {
      expect(isExplorerPath(pathname)).toBe(true)
    },
  )

  it.each(['/', '/explorer', '/explore/deep', '/benchmarks'])(
    'does not match %s',
    (pathname) => {
      expect(isExplorerPath(pathname)).toBe(false)
    },
  )
})

describe('pageRouteOf', () => {
  // A static host serves the build's <route>/index.html by its own name too
  // (routing/staticEntries.ts), and the page there is the route's.
  it.each(PAGE_ROUTES)('reads %s in each of its spellings', (route) => {
    for (const pathname of [route, `${route}/`, `${route}/index.html`]) {
      expect(pageRouteOf(pathname)).toBe(route)
    }
  })

  it.each([
    '/',
    '/index.html',
    '/explore/index.htm',
    '/explore/deep/index.html',
    '/explore//index.html',
    '/explore.html',
  ])('names no page route for %s', (pathname) => {
    expect(pageRouteOf(pathname)).toBeUndefined()
  })
})
