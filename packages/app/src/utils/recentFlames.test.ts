import { MAX_TIMELINE_FRAME } from '@chaos-master/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { clearRecentFlames, clearRecentFlamesCache, deleteRecentFlame, formatRecentDate, getOldestRecentFlame, loadRecentFlame, loadRecentFlames, loadRecentFlamesForRewrite, MAX_RECENT_FLAMES, saveRecentFlame, saveRecentFlames, upsertRecentFlame, } from './recentFlames'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

const STORAGE_KEY = 'chaos-master-recent-flames'

const sampleFlame = () => Object.values(examples)[0] as FlameDescriptor

/** A whole timeline, as the workspace hands one over. */
const sampleConfig = () => ({
  fps: 60,
  timeScale: 2,
  startFrame: 0,
  endFrame: 300,
  loop: false,
  autoFps: false,
  loopMode: 'seamless' as const,
})

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

  it('reads a stored timeline back', () => {
    seed([{ ...goodEntry('a'), config: sampleConfig() }])
    expect(loadRecentFlames()[0]!.config).toEqual(sampleConfig())
  })

  it('drops a timeline that does not validate, and keeps its entry', () => {
    // What the config decides is what playback does: fps 0 stops the
    // timeline dead. The flame is still worth showing, so the entry stays
    // and comes back at the workspace's defaults.
    seed([{ ...goodEntry('a'), config: { fps: 0, endFrame: -5 } }])
    const entries = loadRecentFlames()
    expect(ids(entries)).toEqual(['a'])
    expect(entries[0]!.config).toBeUndefined()
  })

  it('reads a record written before entries carried a timeline', () => {
    seed([goodEntry('a')])
    const entry = loadRecentFlames()[0]!
    expect(entry.config).toBeUndefined()
    expect('config' in entry).toBe(false)
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

// ── loadRecentFlame (one entry, validated like the list) ──────────────────

describe('loadRecentFlame', () => {
  it('reads one entry the way the Library reads the list', () => {
    seed([goodEntry('a'), { ...goodEntry('b'), config: sampleConfig() }])
    expect(loadRecentFlame('b')?.name).toBe('good b')
    expect(loadRecentFlame('b')?.config).toEqual(sampleConfig())
  })

  it('drops an entry the Library would not show', () => {
    // The whole point of validating rather than reading structurally: an
    // entry whose flame fails the schema is invisible in Library, so calling
    // it a copy of anything is a lie about where the work is.
    seed([brokenEntry('bad')])
    expect(loadRecentFlame('bad')).toBeUndefined()
  })

  it('is undefined for an id that is not there, and for junk', () => {
    seed([goodEntry('a')])
    expect(loadRecentFlame('nope')).toBeUndefined()
    seedRaw('{ not json')
    expect(loadRecentFlame('a')).toBeUndefined()
    seedRaw(JSON.stringify({ id: 'a' }))
    expect(loadRecentFlame('a')).toBeUndefined()
  })

  it('agrees with the full loader, warm memo or cold', () => {
    seed([goodEntry('a'), { ...goodEntry('b'), config: sampleConfig() }])
    const cold = loadRecentFlame('b')
    expect(loadRecentFlames().map((e) => e.id)).toEqual(['a', 'b'])
    expect(loadRecentFlame('b')).toEqual(cold)
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
    expect(saveRecentFlame(sampleFlame(), 'nope', undefined, false)).toBe(
      'full',
    )
    expect(loadRecentFlamesForRewrite()).toHaveLength(MAX_RECENT_FLAMES)
  })

  it('refuses without force when the list is full, and writes nothing', () => {
    seed(
      Array.from({ length: MAX_RECENT_FLAMES }, (_, i) => goodEntry(`g${i}`)),
    )
    const before = localStorage.getItem(STORAGE_KEY)
    expect(saveRecentFlame(sampleFlame(), 'nope', undefined, false)).toBe(
      'full',
    )
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before)
  })

  it('stores the timeline it is given', () => {
    seed([])
    saveRecentFlame(sampleFlame(), 'Saved', [], true, sampleConfig())
    expect(loadRecentFlames()[0]!.config).toEqual(sampleConfig())
  })

  it('clamps a timeline past a limit instead of losing all of it', () => {
    // Out of range is not unusable. A seamless loop over a long animation
    // pushes `endFrame` past the ceiling on its own (utils/timeline.ts), and
    // dropping the config for it took the frame rate and the loop mode with
    // it - the flame came back at 30fps over 90 frames, reported as saved.
    seed([])
    const outcome = saveRecentFlame(sampleFlame(), 'Long', [], true, {
      ...sampleConfig(),
      endFrame: 5000,
    })
    expect(outcome).toBe('saved')
    const stored = loadRecentFlames()[0]!.config!
    expect(stored.endFrame).toBe(MAX_TIMELINE_FRAME)
    expect(stored.fps).toBe(sampleConfig().fps)
    expect(stored.loopMode).toBe(sampleConfig().loopMode)
  })

  it('does not report success for a timeline that cannot be read back', () => {
    // A config with a string where the frame rate goes is not a timeline at
    // all: there is nothing to clamp, so the loader still drops it and keeps
    // the entry. The caller marks the workspace clean on success, so a write
    // that claimed this landed would lose it with nothing left to retry.
    seed([])
    const outcome = saveRecentFlame(sampleFlame(), 'Broken', [], true, {
      ...sampleConfig(),
      fps: 'fast',
    } as never)
    expect(loadRecentFlames()[0]!.config).toBeUndefined()
    expect(outcome).toBe('refused')
  })

  it('reports what it did, so a caller knows whether to ask', () => {
    seed([])
    expect(saveRecentFlame(sampleFlame(), 'first')).toBe('saved')
    seed(
      Array.from({ length: MAX_RECENT_FLAMES }, (_, i) => goodEntry(`g${i}`)),
    )
    expect(saveRecentFlame(sampleFlame(), 'nope')).toBe('full')
  })

  it('evicts the oldest when forced, staying at the cap', () => {
    seed(
      Array.from({ length: MAX_RECENT_FLAMES }, (_, i) =>
        goodEntry(`g${i}`, i),
      ),
    )
    expect(saveRecentFlame(sampleFlame(), 'forced', undefined, true)).toBe(
      'saved',
    )
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
    expect(saveRecentFlame(sampleFlame(), 'doomed')).toBe('refused')
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
    expect(upsertRecentFlame('auto', sampleFlame(), 'Autosaved')).toBe('saved')
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

  it('refuses a new entry at the cap rather than evicting the oldest', () => {
    // The autosave writes through here, on a timer and at every document
    // boundary. Making room by dropping the last entry destroyed a flame the
    // user deliberately kept in order to store one they never asked to save,
    // while Save for Later - the write the user does ask for - stops and asks
    // before the same eviction. Nothing evicts without asking, so this
    // declines and says why.
    seed(
      Array.from({ length: MAX_RECENT_FLAMES }, (_, i) =>
        goodEntry(`g${i}`, i),
      ),
    )
    const before = localStorage.getItem(STORAGE_KEY)
    const outcome = upsertRecentFlame('auto', sampleFlame(), 'Autosaved')
    expect(ids(loadRecentFlamesForRewrite())).toContain(
      `g${MAX_RECENT_FLAMES - 1}`,
    )
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before)
    expect(outcome).toBe('full')
  })

  it('still updates its own entry when the list is full', () => {
    // Writing into an id already there replaces it: the list does not grow
    // and nothing is pushed off the end, so this one is always allowed.
    seed([
      ...Array.from({ length: MAX_RECENT_FLAMES - 1 }, (_, i) =>
        goodEntry(`g${i}`, i),
      ),
      goodEntry('auto', 0),
    ])
    expect(upsertRecentFlame('auto', sampleFlame(), 'Updated')).toBe('saved')
    const after = loadRecentFlamesForRewrite()
    expect(after).toHaveLength(MAX_RECENT_FLAMES)
    expect(after[0]!.name).toBe('Updated')
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

  it('does not report success for a timeline that cannot be read back', () => {
    // The autosave marks the workspace clean on success, so the same lie
    // here loses the timeline at the next load boundary rather than at the
    // next launch. `loop` missing entirely is a shape the clamp cannot
    // repair, unlike a value merely out of range.
    seed([])
    const { loop: _loop, ...withoutLoop } = sampleConfig()
    const outcome = upsertRecentFlame(
      'auto',
      sampleFlame(),
      'Broken',
      [],
      withoutLoop as never,
    )
    expect(loadRecentFlames()[0]!.config).toBeUndefined()
    expect(outcome).toBe('refused')
  })

  it('clamps a timeline past a limit instead of losing all of it', () => {
    // Same rule as saveRecentFlame: a stored `fps: 0` would stop playback
    // dead, so it is pulled back to the low end of its range rather than
    // taking the whole config - and with it the end frame and loop mode -
    // out of the entry.
    seed([])
    const outcome = upsertRecentFlame('auto', sampleFlame(), 'Slow', [], {
      ...sampleConfig(),
      fps: 0,
    })
    expect(outcome).toBe('saved')
    const stored = loadRecentFlames()[0]!.config!
    expect(stored.fps).toBe(1)
    expect(stored.endFrame).toBe(sampleConfig().endFrame)
  })

  it('stores the timeline whether or not there are keyframes', () => {
    // Not derived from the tracks: a flame with none still has a frame rate
    // and an end frame, and an entry that dropped this came back at 30fps
    // over 90 frames however it was authored.
    seed([])
    upsertRecentFlame('auto', sampleFlame(), 'Plain', [], sampleConfig())
    expect(loadRecentFlames()[0]!.config).toEqual(sampleConfig())
  })

  it('deep-clones the timeline it stores', () => {
    seed([])
    const config = sampleConfig()
    upsertRecentFlame('auto', sampleFlame(), 'Plain', [], config)
    config.fps = 1
    expect(loadRecentFlames()[0]!.config!.fps).toBe(60)
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
    expect(upsertRecentFlame('auto', sampleFlame(), 'doomed')).toBe('refused')
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
