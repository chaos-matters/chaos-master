/**
 * The custom variations' version, the signal every open renderer follows.
 * A change is one notification however many variations it touches, the saved
 * library already holds a change when anything that follows the version runs,
 * and getCacheVersion reads the version without subscribing to it.
 */
import { createComputed, createRoot } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllCustomVariations, createCustomVariation, customVariationsVersion, deleteCustomVariation, getCacheVersion, importSharedVariations, loadAndImportSharedVariations, loadCustomVariations, persistSharedVariations, updateCustomVariation, } from './CustomVariationRegistry'
import type { CustomVariationDef } from './types'

const STORAGE_KEY = 'chaos-master-custom-variations'

// Unique, compilable code per call: an import matches existing variations by
// their code, and the registry's module state outlives each test.
let serial = 0

function uniqueCode(): string {
  serial += 1
  return `return vec2f(pos.x * ${serial}.5, pos.y);`
}

/** Three variations as a link carries them, with ids no test shares. */
function linkDefs(): CustomVariationDef[] {
  return [0, 1, 2].map(() => {
    const code = uniqueCode()
    return {
      id: `custom_link_${serial}`,
      name: `Linked ${serial}`,
      wgsl: code,
      createdAt: 0,
      updatedAt: 0,
    }
  })
}

/** Writes a saved library of three, as a previous session left it. */
function saveLibrary(): void {
  const variations = Object.fromEntries(
    [0, 1, 2].map((i) => {
      const id = `custom_saved_${i}`
      return [id, { id, name: `Saved ${i}`, wgsl: uniqueCode() }]
    }),
  )
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, variations }))
}

function storedCode(id: string): string | undefined {
  const store = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
    variations?: Record<string, CustomVariationDef>
  }
  return store.variations?.[id]?.wgsl
}

/** How many times the version notifies its subscribers while `change` runs. */
function notificationsDuring(change: () => void): number {
  let runs = 0
  createRoot((dispose) => {
    createComputed(() => {
      customVariationsVersion()
      runs += 1
    })
    runs = 0
    change()
    dispose()
  })
  return runs
}

// The test runner's own localStorage is not a working Storage.
const stored = new Map<string, string>()
const memoryStorage: Storage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => {
    stored.set(key, value)
  },
  removeItem: (key) => {
    stored.delete(key)
  },
  clear: () => {
    stored.clear()
  },
  key: (index) => [...stored.keys()][index] ?? null,
  get length() {
    return stored.size
  },
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage)
  clearAllCustomVariations()
  stored.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the custom variations version', () => {
  it('changes once when the saved library of three loads', () => {
    saveLibrary()
    expect(notificationsDuring(loadCustomVariations)).toBe(1)
  })

  it('changes once when three variations are cleared', () => {
    for (let i = 0; i < 3; i += 1)
      createCustomVariation(`Mine ${i}`, uniqueCode())
    expect(notificationsDuring(clearAllCustomVariations)).toBe(1)
  })

  it('changes once when a link brings three variations', () => {
    const defs = linkDefs()
    expect(notificationsDuring(() => importSharedVariations(defs))).toBe(1)
  })

  it('changes once when three variations from a link are saved', () => {
    const ids = importSharedVariations(linkDefs()).imported.map((d) => d.id)
    expect(ids).toHaveLength(3)
    expect(
      notificationsDuring(() => {
        persistSharedVariations(ids)
      }),
    ).toBe(1)
  })

  it('changes once when the library loads and a link imports against it', () => {
    saveLibrary()
    const defs = linkDefs()
    expect(notificationsDuring(() => loadAndImportSharedVariations(defs))).toBe(
      1,
    )
  })

  it('is saved before anything that follows it runs', () => {
    const first = uniqueCode()
    const second = uniqueCode()
    const made = createCustomVariation('Saved first', first)
    if (!made.success) throw new Error(JSON.stringify(made.errors))
    const seen: (string | undefined)[] = []
    createRoot((dispose) => {
      createComputed(() => {
        customVariationsVersion()
        seen.push(storedCode(made.def.id))
      })
      updateCustomVariation(made.def.id, second)
      deleteCustomVariation(made.def.id)
      dispose()
    })
    expect(seen).toEqual([first, second, undefined])
  })

  it('is read by getCacheVersion without subscribing to it', () => {
    let tracked = 0
    let untracked = 0
    createRoot((dispose) => {
      createComputed(() => {
        customVariationsVersion()
        tracked += 1
      })
      createComputed(() => {
        getCacheVersion()
        untracked += 1
      })
      createCustomVariation('One more', uniqueCode())
      dispose()
    })
    expect({ tracked, untracked }).toEqual({ tracked: 2, untracked: 1 })
  })
})
