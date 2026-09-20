import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEGACY_DRAFT_KEY } from '@/lib/pauseSave'
import { clearSettings, computeStorageUsage } from './storageUsage'

// The two IndexedDB-backed histories. This runtime has no IndexedDB and the
// store throws on the way in rather than rejecting, so the module's own
// `.catch` never sees it - and none of it is what is under test here, which is
// which localStorage keys count as settings.
vi.mock('./logoHistoryDB', () => ({
  clearHistory: () => Promise.resolve(),
  loadHistoryEntries: () => Promise.resolve([]),
}))
vi.mock('./randomizerHistoryDB', () => ({
  clearRandomizerHistory: () => Promise.resolve(),
  loadRandomizerHistoryEntries: () => Promise.resolve([]),
}))

/**
 * localStorage, near enough for a key sweep: what this module does is walk
 * every key under the app's prefix and decide which of them are settings.
 */
class MemoryStorage {
  private readonly entries = new Map<string, string>()
  get length(): number {
    return this.entries.size
  }
  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null
  }
  getItem(key: string): string | null {
    return this.entries.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.entries.set(key, value)
  }
  removeItem(key: string): void {
    this.entries.delete(key)
  }
  clear(): void {
    this.entries.clear()
  }
}

const memory = new MemoryStorage()

beforeEach(() => {
  memory.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    value: memory,
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  memory.clear()
})

describe('clearing settings', () => {
  it('leaves the pre-fold crash slot where it is', () => {
    // THE TRAP. Recents is full, so the app tells the user to free space.
    // They open Data Management, read "Your saved flames are not touched",
    // and clear their settings - and the crash slot went with the theme,
    // because the sweep took every `chaos-master-*` key that was not the
    // Recents list. Nothing writes that slot now, but until the migration
    // has moved it onto the shelf it is still the only copy of whatever the
    // build before the fold was holding (lib/pauseSave.ts).
    memory.setItem(LEGACY_DRAFT_KEY, '{"flame":{},"savedAt":1}')
    memory.setItem('chaos-master-theme', '"dark"')
    memory.setItem('chaos-master-recent-flames', '[]')

    const cleared = clearSettings()

    expect(memory.getItem(LEGACY_DRAFT_KEY)).toBe('{"flame":{},"savedAt":1}')
    expect(memory.getItem('chaos-master-theme')).toBeNull()
    // And it is not counted as a setting either, so the dialog does not offer
    // the user bytes it is not going to free.
    expect(cleared.count).toBe(1)
  })

  it('does not count that slot in the settings the dialog offers to free', async () => {
    memory.setItem(LEGACY_DRAFT_KEY, `{"padding":"${'x'.repeat(500)}"}`)
    memory.setItem('chaos-master-theme', '"dark"')

    const usage = await computeStorageUsage()

    expect(usage.settings.count).toBe(1)
    expect(usage.settings.bytes).toBeLessThan(100)
  })

  it('still clears ordinary settings', () => {
    memory.setItem('chaos-master-theme', '"dark"')
    memory.setItem('chaos-master-editor/autosave-recents', '"on"')
    memory.setItem('unrelated-app-key', 'kept')

    const cleared = clearSettings()

    expect(cleared.count).toBe(2)
    expect(memory.getItem('chaos-master-theme')).toBeNull()
    expect(memory.getItem('chaos-master-editor/autosave-recents')).toBeNull()
    // Another app's keys were never this sweep's business.
    expect(memory.getItem('unrelated-app-key')).toBe('kept')
  })
})
