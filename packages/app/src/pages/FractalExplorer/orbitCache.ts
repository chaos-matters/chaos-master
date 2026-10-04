/**
 * The orbit worker's store of finished reference orbits, capped by count
 * and by bytes, evicting the oldest first.
 *
 * It never evicts an orbit the current request uses. A Julia request uses
 * two, its view's and the critical orbit of c, and near the largest
 * iteration limit those two alone outgrow the byte cap. Evicting either one
 * to make room for the other would iterate both again on every pan, which
 * is the case the cache is for, so they stay, over the cap, until a later
 * request no longer uses them.
 */
import type { ReferenceOrbit } from '@chaos-master/core'

/** A stored orbit costs 20 B an entry: a pair of doubles and an exponent. */
const BYTES_PER_ENTRY = 20

export interface OrbitCacheLimits {
  readonly orbits: number
  readonly bytes: number
}

export interface OrbitCache {
  get(key: string): ReferenceOrbit | undefined
  /**
   * Keep `orbit` under `key`, then evict the oldest orbits that are not in
   * `inUse` until the cache is within its limits, or nothing else is left.
   */
  remember(key: string, orbit: ReferenceOrbit, inUse: readonly string[]): void
}

export function createOrbitCache(limits: OrbitCacheLimits): OrbitCache {
  const cache = new Map<string, ReferenceOrbit>()
  const bytes = () =>
    [...cache.values()].reduce((sum, o) => sum + o.length * BYTES_PER_ENTRY, 0)
  const over = () => cache.size > limits.orbits || bytes() > limits.bytes
  return {
    get: (key) => cache.get(key),
    remember(key, orbit, inUse) {
      cache.set(key, orbit)
      // A Map iterates in insertion order, so this is oldest first. The
      // orbit just made is in use whatever the caller says.
      for (const old of [...cache.keys()]) {
        if (!over()) return
        if (old !== key && !inUse.includes(old)) cache.delete(old)
      }
    },
  }
}
