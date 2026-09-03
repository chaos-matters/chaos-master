import { beforeEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { clearRecentFlamesCache, deleteRecentFlame, loadRecentFlames, loadRecentFlamesForRewrite, MAX_RECENT_FLAMES, saveRecentFlame, } from './recentFlames'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

const STORAGE_KEY = 'chaos-master-recent-flames'

const sampleFlame = () => Object.values(examples)[0] as FlameDescriptor

/** An entry that passes the structural check but fails the flame schema — the
 *  shape a stale save or a schema tightening leaves behind. */
const brokenEntry = (id: string) => ({
  id,
  name: `broken ${id}`,
  savedAt: Date.now(),
  flame: { nonsense: true },
})

const goodEntry = (id: string) => ({
  id,
  name: `good ${id}`,
  savedAt: Date.now(),
  flame: sampleFlame(),
})

// The runner's own localStorage is not writable; back it with a plain map, the
// same way `flameImport.test.ts` does.
const stored = new Map<string, string>()
const memoryStorage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => {
    stored.set(key, value)
  },
  removeItem: (key: string) => {
    stored.delete(key)
  },
  clear: () => {
    stored.clear()
  },
  key: (index: number) => [...stored.keys()][index] ?? null,
  get length() {
    return stored.size
  },
}

function seed(entries: unknown[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  clearRecentFlamesCache()
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage)
  stored.clear()
  clearRecentFlamesCache()
})

describe('loadRecentFlames memo', () => {
  it('returns the same content on a repeat call', () => {
    seed([goodEntry('a'), goodEntry('b')])
    const first = loadRecentFlames()
    const second = loadRecentFlames()
    expect(second).toHaveLength(first.length)
    expect(second.map((e) => e.id)).toEqual(first.map((e) => e.id))
  })

  it('hands out a fresh array so callers cannot corrupt the memo', () => {
    seed([goodEntry('a'), goodEntry('b')])
    const first = loadRecentFlames()
    first.pop()
    expect(loadRecentFlames()).toHaveLength(2)
  })

  it('re-reads when the stored payload changes underneath it', () => {
    seed([goodEntry('a')])
    expect(loadRecentFlames().map((e) => e.id)).toEqual(['a'])

    // Written directly, as another tab would — no invalidation call.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([goodEntry('a'), goodEntry('b')]),
    )
    expect(loadRecentFlames().map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('still drops schema-invalid entries from the validated read', () => {
    seed([goodEntry('a'), brokenEntry('bad'), goodEntry('b')])
    expect(loadRecentFlames().map((e) => e.id)).toEqual(['a', 'b'])
  })
})

// Regression: a read-modify-write built on the *validated* list rewrites storage
// without the entries the validator rejected, so one save or delete silently
// deletes them. `loadRecentFlamesForRewrite` exists for exactly this.
describe('read-modify-write preserves schema-invalid entries', () => {
  it('saving a flame does not delete them', () => {
    seed([goodEntry('a'), brokenEntry('bad')])
    saveRecentFlame(sampleFlame(), 'new one')
    expect(loadRecentFlamesForRewrite().map((e) => e.id)).toContain('bad')
  })

  it('deleting one entry does not delete them', () => {
    seed([goodEntry('a'), brokenEntry('bad'), goodEntry('b')])
    deleteRecentFlame('a')
    const ids = loadRecentFlamesForRewrite().map((e) => e.id)
    expect(ids).toContain('bad')
    expect(ids).not.toContain('a')
  })

  it('counts them toward the full-list guard', () => {
    seed(
      Array.from({ length: MAX_RECENT_FLAMES }, (_, i) => brokenEntry(`b${i}`)),
    )
    // The list IS full; a non-forcing save must refuse rather than silently
    // rewriting 150 broken entries down to one good one.
    expect(saveRecentFlame(sampleFlame(), 'nope', undefined, false)).toBe(false)
    expect(loadRecentFlamesForRewrite()).toHaveLength(MAX_RECENT_FLAMES)
  })
})
