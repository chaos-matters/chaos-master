import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { clearRecentFlames, clearRecentFlamesCache, deleteRecentFlame, formatRecentDate, getOldestRecentFlame, loadRecentFlames, loadRecentFlamesForRewrite, MAX_RECENT_FLAMES, saveRecentFlame, saveRecentFlames, upsertRecentFlame, } from './recentFlames'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

const STORAGE_KEY = 'chaos-master-recent-flames'

const sampleFlame = () => Object.values(examples)[0] as FlameDescriptor

/** Minimal timeline track — only its presence and cloning matter here. */
const sampleTrack = () => ({
  id: 'track-1',
  target: 'camera',
  keyframes: [{ frame: 0, value: 0 }],
})

/** Passes `isValidRecentFlame` but fails the flame schema — the shape a stale
 *  save or a schema tightening leaves behind in a real user's storage. */
const brokenEntry = (id: string) => ({
  id,
  name: `broken ${id}`,
  savedAt: 1,
  flame: { nonsense: true },
})

const goodEntry = (id: string, savedAt = 1) => ({
  id,
  name: `good ${id}`,
  savedAt,
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

function seedRaw(raw: string) {
  localStorage.setItem(STORAGE_KEY, raw)
  clearRecentFlamesCache()
}

const ids = (entries: { id: string }[]) => entries.map((e) => e.id)

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage)
  stored.clear()
  clearRecentFlamesCache()
})

// ── loadRecentFlames: malformed and empty input ───────────────────────────

describe('loadRecentFlames input handling', () => {
  it('returns empty when nothing is stored', () => {
    expect(loadRecentFlames()).toEqual([])
  })

  it('returns empty for an empty stored list', () => {
    seed([])
    expect(loadRecentFlames()).toEqual([])
  })

  it('returns empty for malformed JSON rather than throwing', () => {
    seedRaw('{ not json')
    expect(loadRecentFlames()).toEqual([])
  })

  it('returns empty when the payload is not an array', () => {
    seedRaw(JSON.stringify({ id: 'a' }))
    expect(loadRecentFlames()).toEqual([])
  })

  it('returns empty when localStorage itself throws (private mode)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
    })
    expect(loadRecentFlames()).toEqual([])
  })

  it.each([
    ['missing id', { name: 'n', savedAt: 1, flame: sampleFlame() }],
    ['missing name', { id: 'a', savedAt: 1, flame: sampleFlame() }],
    ['missing savedAt', { id: 'a', name: 'n', flame: sampleFlame() }],
    ['missing flame', { id: 'a', name: 'n', savedAt: 1 }],
    ['non-object entry', 'nope'],
    ['null entry', null],
  ])('drops a structurally invalid entry (%s)', (_label, bad) => {
    seed([goodEntry('keep'), bad])
    expect(ids(loadRecentFlames())).toEqual(['keep'])
  })

  it('drops entries that fail the flame schema', () => {
    seed([goodEntry('a'), brokenEntry('bad'), goodEntry('b')])
    expect(ids(loadRecentFlames())).toEqual(['a', 'b'])
  })
})

// ── loadRecentFlames: the memo ────────────────────────────────────────────

describe('loadRecentFlames memo', () => {
  it('returns the same content on a repeat call', () => {
    seed([goodEntry('a'), goodEntry('b')])
    expect(ids(loadRecentFlames())).toEqual(ids(loadRecentFlames()))
  })

  it('hands out a fresh outer array each call', () => {
    seed([goodEntry('a'), goodEntry('b')])
    const first = loadRecentFlames()
    expect(loadRecentFlames()).not.toBe(first)
    first.pop()
    expect(loadRecentFlames()).toHaveLength(2)
  })

  it('re-reads when the payload changes out of band (another tab)', () => {
    seed([goodEntry('a')])
    expect(ids(loadRecentFlames())).toEqual(['a'])
    // Written directly, with no invalidation call — the memo must notice.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([goodEntry('a'), goodEntry('b')]),
    )
    expect(ids(loadRecentFlames())).toEqual(['a', 'b'])
  })

  it('reflects a save without an explicit invalidation', () => {
    seed([goodEntry('a')])
    loadRecentFlames()
    saveRecentFlame(sampleFlame(), 'fresh')
    expect(loadRecentFlames().map((e) => e.name)).toContain('fresh')
  })

  it('reflects a delete without an explicit invalidation', () => {
    seed([goodEntry('a'), goodEntry('b')])
    loadRecentFlames()
    deleteRecentFlame('a')
    expect(ids(loadRecentFlames())).toEqual(['b'])
  })

  it('reflects a wholesale overwrite by the backup importer', () => {
    seed([goodEntry('a')])
    loadRecentFlames()
    saveRecentFlames([goodEntry('x'), goodEntry('y')] as never)
    expect(ids(loadRecentFlames())).toEqual(['x', 'y'])
  })

  it('empties after clearRecentFlames', () => {
    seed([goodEntry('a')])
    loadRecentFlames()
    clearRecentFlames()
    expect(loadRecentFlames()).toEqual([])
  })

  it('stays correct when an identical payload is written back', () => {
    const payload = [goodEntry('a'), goodEntry('b')]
    seed(payload)
    expect(ids(loadRecentFlames())).toEqual(['a', 'b'])
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    expect(ids(loadRecentFlames())).toEqual(['a', 'b'])
  })

  it('freezes shared entries in dev so a caller cannot corrupt later reads', () => {
    seed([goodEntry('a')])
    const entry = loadRecentFlames()[0]!
    expect(Object.isFrozen(entry)).toBe(true)
    expect(() => {
      ;(entry as { name: string }).name = 'mutated'
    }).toThrow()
    expect(loadRecentFlames()[0]!.name).toBe('good a')
  })
})

// ── loadRecentFlamesForRewrite ────────────────────────────────────────────

describe('loadRecentFlamesForRewrite', () => {
  it('keeps schema-invalid entries the validated loader drops', () => {
    seed([goodEntry('a'), brokenEntry('bad')])
    expect(ids(loadRecentFlames())).toEqual(['a'])
    expect(ids(loadRecentFlamesForRewrite())).toEqual(['a', 'bad'])
  })

  it('still drops structurally invalid entries', () => {
    seed([goodEntry('a'), { id: 'no-name', savedAt: 1, flame: {} }])
    expect(ids(loadRecentFlamesForRewrite())).toEqual(['a'])
  })

  it('returns empty for malformed JSON', () => {
    seedRaw('nope')
    expect(loadRecentFlamesForRewrite()).toEqual([])
  })

  it('returns empty when the payload is not an array', () => {
    seedRaw(JSON.stringify({ id: 'a' }))
    expect(loadRecentFlamesForRewrite()).toEqual([])
  })

  it('returns empty when nothing is stored', () => {
    expect(loadRecentFlamesForRewrite()).toEqual([])
  })

  it('returns unfrozen entries, since rewrites build on them', () => {
    seed([goodEntry('a')])
    expect(Object.isFrozen(loadRecentFlamesForRewrite()[0])).toBe(false)
  })
})

// ── saveRecentFlame ───────────────────────────────────────────────────────

describe('saveRecentFlame', () => {
  it('prepends the new entry', () => {
    seed([goodEntry('a')])
    saveRecentFlame(sampleFlame(), 'newest')
    expect(loadRecentFlames()[0]!.name).toBe('newest')
  })

  it('falls back to the flame name, then a default', () => {
    seed([])
    saveRecentFlame(sampleFlame())
    const name = loadRecentFlames()[0]!.name
    expect(name === sampleFlame().metadata?.name || name === 'Flame').toBe(true)
  })

  it('stores tracks only when there are keyframes', () => {
    seed([])
    saveRecentFlame(sampleFlame(), 'no tracks', [])
    expect(loadRecentFlamesForRewrite()[0]!.tracks).toBeUndefined()
  })

  it('stores tracks when there are keyframes, deep-cloned', () => {
    seed([])
    const tracks = [sampleTrack()]
    saveRecentFlame(sampleFlame(), 'animated', tracks as never)
    const saved = loadRecentFlamesForRewrite()[0]!
    expect(saved.tracks).toHaveLength(1)
    // Cloned, not aliased: editing the caller's tracks must not rewrite history.
    tracks[0]!.id = 'mutated-after-save'
    expect(loadRecentFlamesForRewrite()[0]!.tracks).not.toContainEqual(
      expect.objectContaining({ id: 'mutated-after-save' }),
    )
  })

  it('deep-clones the flame so later edits do not rewrite history', () => {
    seed([])
    const flame = structuredClone(sampleFlame())
    saveRecentFlame(flame, 'snapshot')
    const before = JSON.stringify(loadRecentFlamesForRewrite()[0]!.flame)
    flame.renderSettings.dimensions =
      flame.renderSettings.dimensions === 3 ? 2 : 3
    expect(JSON.stringify(loadRecentFlamesForRewrite()[0]!.flame)).toBe(before)
  })

  // Regression: a read-modify-write on the *validated* list rewrites storage
  // without the entries the validator rejected.
  it('preserves schema-invalid entries', () => {
    seed([goodEntry('a'), brokenEntry('bad')])
    saveRecentFlame(sampleFlame(), 'new one')
    expect(ids(loadRecentFlamesForRewrite())).toContain('bad')
  })

  it('counts schema-invalid entries toward the full-list guard', () => {
    seed(
      Array.from({ length: MAX_RECENT_FLAMES }, (_, i) => brokenEntry(`b${i}`)),
    )
    expect(saveRecentFlame(sampleFlame(), 'nope', undefined, false)).toBe(false)
    expect(loadRecentFlamesForRewrite()).toHaveLength(MAX_RECENT_FLAMES)
  })

  it('refuses without force when the list is full, and writes nothing', () => {
    seed(
      Array.from({ length: MAX_RECENT_FLAMES }, (_, i) => goodEntry(`g${i}`)),
    )
    const before = localStorage.getItem(STORAGE_KEY)
    expect(saveRecentFlame(sampleFlame(), 'nope', undefined, false)).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before)
  })

  it('evicts the oldest when forced, staying at the cap', () => {
    seed(
      Array.from({ length: MAX_RECENT_FLAMES }, (_, i) =>
        goodEntry(`g${i}`, i),
      ),
    )
    expect(saveRecentFlame(sampleFlame(), 'forced', undefined, true)).toBe(true)
    const after = loadRecentFlamesForRewrite()
    expect(after).toHaveLength(MAX_RECENT_FLAMES)
    expect(after[0]!.name).toBe('forced')
    expect(ids(after)).not.toContain(`g${MAX_RECENT_FLAMES - 1}`)
  })

  // Regression: this used to return true even when the write failed, and the
  // caller marks the workspace clean on success.
  it('reports failure when the storage write fails', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    })
    expect(saveRecentFlame(sampleFlame(), 'doomed')).toBe(false)
  })
})

// ── deleteRecentFlame ─────────────────────────────────────────────────────

describe('deleteRecentFlame', () => {
  it('removes the named entry', () => {
    seed([goodEntry('a'), goodEntry('b')])
    expect(deleteRecentFlame('a')).toBe(true)
    expect(ids(loadRecentFlames())).toEqual(['b'])
  })

  it('is a no-op for an unknown id', () => {
    seed([goodEntry('a')])
    deleteRecentFlame('nope')
    expect(ids(loadRecentFlames())).toEqual(['a'])
  })

  it('preserves schema-invalid entries', () => {
    seed([goodEntry('a'), brokenEntry('bad'), goodEntry('b')])
    deleteRecentFlame('a')
    const remaining = ids(loadRecentFlamesForRewrite())
    expect(remaining).toContain('bad')
    expect(remaining).not.toContain('a')
  })

  it('reports failure when the storage write fails', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify([goodEntry('a')]),
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    })
    expect(deleteRecentFlame('a')).toBe(false)
  })
})

// ── getOldestRecentFlame ──────────────────────────────────────────────────

describe('getOldestRecentFlame', () => {
  it('returns undefined for an empty list', () => {
    seed([])
    expect(getOldestRecentFlame()).toBeUndefined()
  })

  it('returns the last stored entry', () => {
    seed([goodEntry('newest'), goodEntry('oldest')])
    expect(getOldestRecentFlame()?.id).toBe('oldest')
  })

  // It names the entry a forced save would evict, so it must see the entries
  // the schema rejects — those get evicted too.
  it('can name a schema-invalid entry', () => {
    seed([goodEntry('a'), brokenEntry('bad')])
    expect(getOldestRecentFlame()?.id).toBe('bad')
  })
})

// ── upsertRecentFlame (autosave path) ─────────────────────────────────────

describe('upsertRecentFlame', () => {
  it('inserts a new entry at the front', () => {
    seed([goodEntry('a')])
    expect(upsertRecentFlame('auto', sampleFlame(), 'Autosaved')).toBe(true)
    expect(ids(loadRecentFlamesForRewrite())).toEqual(['auto', 'a'])
  })

  it('updates in place by id instead of appending a duplicate', () => {
    seed([goodEntry('a'), goodEntry('auto')])
    upsertRecentFlame('auto', sampleFlame(), 'Updated')
    const after = loadRecentFlamesForRewrite()
    expect(ids(after)).toEqual(['auto', 'a'])
    expect(after[0]!.name).toBe('Updated')
  })

  it('keeps the list at the cap', () => {
    seed(
      Array.from({ length: MAX_RECENT_FLAMES }, (_, i) => goodEntry(`g${i}`)),
    )
    upsertRecentFlame('auto', sampleFlame(), 'Autosaved')
    expect(loadRecentFlamesForRewrite()).toHaveLength(MAX_RECENT_FLAMES)
  })

  it('preserves schema-invalid entries', () => {
    seed([brokenEntry('bad')])
    upsertRecentFlame('auto', sampleFlame(), 'Autosaved')
    expect(ids(loadRecentFlamesForRewrite())).toContain('bad')
  })

  it('stores tracks when there are keyframes, and omits empty ones', () => {
    seed([])
    upsertRecentFlame('auto', sampleFlame(), 'Animated', [
      sampleTrack(),
    ] as never)
    expect(loadRecentFlamesForRewrite()[0]!.tracks).toHaveLength(1)
    upsertRecentFlame('auto2', sampleFlame(), 'Plain', [])
    expect(loadRecentFlamesForRewrite()[0]!.tracks).toBeUndefined()
  })

  it('falls back to "Autosave" with no name, no metadata and no prior entry', () => {
    seed([])
    const unnamed = {
      ...sampleFlame(),
      metadata: undefined,
    } as unknown as FlameDescriptor
    upsertRecentFlame('auto', unnamed)
    expect(loadRecentFlamesForRewrite()[0]!.name).toBe('Autosave')
  })

  it('inherits the existing name when none is given', () => {
    seed([])
    upsertRecentFlame('auto', sampleFlame(), 'Original')
    upsertRecentFlame('auto', sampleFlame())
    expect(loadRecentFlamesForRewrite()[0]!.name).toBe('Original')
  })

  it('reports failure when the storage write fails', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    })
    expect(upsertRecentFlame('auto', sampleFlame(), 'doomed')).toBe(false)
  })
})

// ── formatRecentDate ──────────────────────────────────────────────────────

describe('formatRecentDate', () => {
  // Fixed clock: 2026-05-26 14:30 local, so "today"/"yesterday" are decidable.
  const NOW = new Date(2026, 4, 26, 14, 30, 0)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('labels today by time alone', () => {
    expect(formatRecentDate(new Date(2026, 4, 26, 9, 5).getTime())).toBe(
      'Today, 09:05',
    )
  })

  it('labels yesterday', () => {
    expect(formatRecentDate(new Date(2026, 4, 25, 23, 59).getTime())).toBe(
      'Yesterday, 23:59',
    )
  })

  it('falls back to month and day for anything older', () => {
    expect(formatRecentDate(new Date(2026, 4, 20, 14, 30).getTime())).toMatch(
      /^\w+ 20, 14:30$/,
    )
  })

  it('crosses a month boundary for yesterday', () => {
    vi.setSystemTime(new Date(2026, 5, 1, 8, 0))
    expect(formatRecentDate(new Date(2026, 4, 31, 8, 0).getTime())).toBe(
      'Yesterday, 08:00',
    )
  })

  it('does not call the same day in a different year "today"', () => {
    expect(formatRecentDate(new Date(2025, 4, 26, 14, 30).getTime())).toMatch(
      /^\w+ 26, 14:30$/,
    )
  })

  it('zero-pads hours and minutes', () => {
    expect(formatRecentDate(new Date(2026, 4, 26, 0, 0).getTime())).toBe(
      'Today, 00:00',
    )
  })
})
