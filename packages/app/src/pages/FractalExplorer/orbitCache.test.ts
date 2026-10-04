/**
 * The orbit cache's eviction: oldest first once over either limit, and
 * never an orbit the current request uses, even when those alone are over.
 */
import { describe, expect, it } from 'vitest'
import { createOrbitCache } from './orbitCache'
import type { ReferenceOrbit } from '@chaos-master/core'

/** An orbit of `length` entries, 20 B each. */
function orbit(length: number): ReferenceOrbit {
  return {
    z: new Float64Array(2 * length),
    zExp: new Int32Array(length),
    length,
    escaped: false,
  }
}

function kept(cache: ReturnType<typeof createOrbitCache>, keys: string[]) {
  return keys.filter((key) => cache.get(key) !== undefined)
}

describe('createOrbitCache', () => {
  it('returns what it was given', () => {
    const cache = createOrbitCache({ orbits: 4, bytes: 1000 })
    const a = orbit(10)
    cache.remember('a', a, ['a'])
    expect(cache.get('a')).toBe(a)
    expect(cache.get('b')).toBeUndefined()
  })

  it('evicts the oldest orbit once over its count', () => {
    const cache = createOrbitCache({ orbits: 2, bytes: Infinity })
    for (const key of ['a', 'b', 'c']) cache.remember(key, orbit(1), [key])
    expect(kept(cache, ['a', 'b', 'c'])).toEqual(['b', 'c'])
  })

  it('evicts the oldest orbits once over its bytes', () => {
    // Room for 250 entries.
    const cache = createOrbitCache({ orbits: 10, bytes: 5000 })
    cache.remember('a', orbit(100), ['a'])
    cache.remember('b', orbit(100), ['b'])
    expect(kept(cache, ['a', 'b'])).toEqual(['a', 'b'])
    cache.remember('c', orbit(200), ['c'])
    expect(kept(cache, ['a', 'b', 'c'])).toEqual(['c'])
  })

  it('keeps the critical orbit across a Julia pan when the two orbits are over the cap', () => {
    // The worker's case at 4M iterations: two orbits of 80 MB each against
    // a 128 MiB cap. Here each is 2000 B against 3000.
    const cache = createOrbitCache({ orbits: 4, bytes: 3000 })
    // The first view: its own orbit, then the critical orbit of c.
    const first = ['view 1', 'critical']
    cache.remember('view 1', orbit(100), first)
    cache.remember('critical', orbit(100), first)
    expect(kept(cache, first)).toEqual(first)
    // A pan: a new view orbit beside the same critical orbit.
    const second = ['view 2', 'critical']
    cache.remember('view 2', orbit(100), second)
    expect(kept(cache, ['view 1', ...second])).toEqual(second)
    // A new c: nothing of the old view is in use any more.
    const third = ['view 3', 'critical of c 2']
    cache.remember('view 3', orbit(100), third)
    cache.remember('critical of c 2', orbit(100), third)
    expect(kept(cache, ['view 2', 'critical', ...third])).toEqual(third)
  })

  it('keeps the orbit just made even over the cap, and drops it once unused', () => {
    const cache = createOrbitCache({ orbits: 4, bytes: 1000 })
    // Unnamed in `inUse`, and still in use: it is about to be read.
    cache.remember('huge', orbit(100), [])
    expect(kept(cache, ['huge'])).toEqual(['huge'])
    cache.remember('small', orbit(10), [])
    expect(kept(cache, ['huge', 'small'])).toEqual(['small'])
  })
})
