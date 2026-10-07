/**
 * The Glass panels setting: stored like the touch layout preference, on by
 * default, and mirrored onto <html> for the stylesheets.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'chaos-master-chaos-glass-panels'

// The runner's own localStorage is not writable; back it with a plain map, the
// same way recentFlames.test.ts does.
const stored = new Map<string, string>()
const memoryStorage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => {
    stored.set(key, value)
  },
  removeItem: (key: string) => {
    stored.delete(key)
  },
}

/** The module reads the stored value once, when it loads, as at a launch. */
async function launch() {
  vi.resetModules()
  return import('./glass')
}

describe('the Glass panels setting', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage)
    stored.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete document.documentElement.dataset.glassPanels
  })

  it('is on until someone turns it off, and says so on <html>', async () => {
    const glass = await launch()
    glass.applyGlassPanels()

    expect(glass.glassPanels()).toBe(true)
    expect(document.documentElement.getAttribute('data-glass-panels')).toBe(
      'on',
    )
    // The default is not written down, so a later default reaches everyone
    // who never chose.
    expect(stored.has(KEY)).toBe(false)
  })

  it('writes the attribute and stores the choice when turned on', async () => {
    const glass = await launch()
    glass.setGlassPanels(false)
    glass.setGlassPanels(true)

    expect(glass.glassPanels()).toBe(true)
    expect(document.documentElement.getAttribute('data-glass-panels')).toBe(
      'on',
    )
    expect(stored.get(KEY)).toBe('true')
  })

  it('removes the attribute rather than writing "off" when turned off', async () => {
    const glass = await launch()
    glass.setGlassPanels(true)
    glass.setGlassPanels(false)

    expect(document.documentElement.hasAttribute('data-glass-panels')).toBe(
      false,
    )
    expect(stored.get(KEY)).toBe('false')
  })

  it('puts a stored choice back on <html> at the next launch', async () => {
    stored.set(KEY, 'true')
    const glass = await launch()

    expect(glass.glassPanels()).toBe(true)
    expect(document.documentElement.hasAttribute('data-glass-panels')).toBe(
      false,
    )
    glass.applyGlassPanels()
    expect(document.documentElement.getAttribute('data-glass-panels')).toBe(
      'on',
    )
  })

  it('keeps a stored "off" over the default at the next launch', async () => {
    stored.set(KEY, 'false')
    const glass = await launch()
    glass.applyGlassPanels()

    expect(glass.glassPanels()).toBe(false)
    expect(document.documentElement.hasAttribute('data-glass-panels')).toBe(
      false,
    )
  })
})

/**
 * A matchMedia whose answers the test sets, and can change as the system
 * setting would, with the listeners the module registers.
 */
function fakeMatchMedia(initial: Record<string, boolean>) {
  const matches = new Map(Object.entries(initial))
  const listeners = new Map<string, ((event: { matches: boolean }) => void)[]>()
  const matchMedia = (query: string) => ({
    get matches() {
      return matches.get(query) ?? false
    },
    addEventListener: (
      _type: string,
      listener: (event: { matches: boolean }) => void,
    ) => {
      listeners.set(query, [...(listeners.get(query) ?? []), listener])
    },
  })
  return {
    matchMedia,
    change(query: string, value: boolean) {
      matches.set(query, value)
      for (const listener of listeners.get(query) ?? []) {
        listener({ matches: value })
      }
    },
  }
}

const REDUCE_TRANSPARENCY = '(prefers-reduced-transparency: reduce)'
const MORE_CONTRAST = '(prefers-contrast: more)'

describe('glass is allowed', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage)
    stored.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete document.documentElement.dataset.glassPanels
  })

  it.each([REDUCE_TRANSPARENCY, MORE_CONTRAST])(
    'not under %s, with the setting still on',
    async (query) => {
      vi.stubGlobal('matchMedia', fakeMatchMedia({ [query]: true }).matchMedia)
      const glass = await launch()
      glass.applyGlassPanels()

      // The setting is the user's; the system preference only overrides it.
      expect(glass.glassPanels()).toBe(true)
      expect(glass.glassAllowed()).toBe(false)
      expect(glass.optionalPanelGlass('dark')).toBe(false)
      expect(document.documentElement.hasAttribute('data-glass-panels')).toBe(
        false,
      )
    },
  )

  it('follows the system preference as it changes', async () => {
    const media = fakeMatchMedia({ [REDUCE_TRANSPARENCY]: false })
    vi.stubGlobal('matchMedia', media.matchMedia)
    const glass = await launch()
    glass.applyGlassPanels()
    expect(glass.glassAllowed()).toBe(true)
    expect(document.documentElement.getAttribute('data-glass-panels')).toBe(
      'on',
    )

    media.change(REDUCE_TRANSPARENCY, true)
    expect(glass.glassAllowed()).toBe(false)
    expect(document.documentElement.hasAttribute('data-glass-panels')).toBe(
      false,
    )

    media.change(REDUCE_TRANSPARENCY, false)
    expect(glass.glassAllowed()).toBe(true)
    expect(document.documentElement.getAttribute('data-glass-panels')).toBe(
      'on',
    )
  })

  it('stays off with the setting off whatever the system asks', async () => {
    stored.set(KEY, 'false')
    const media = fakeMatchMedia({ [MORE_CONTRAST]: true })
    vi.stubGlobal('matchMedia', media.matchMedia)
    const glass = await launch()
    glass.applyGlassPanels()
    media.change(MORE_CONTRAST, false)

    expect(glass.glassAllowed()).toBe(false)
    expect(document.documentElement.hasAttribute('data-glass-panels')).toBe(
      false,
    )
  })
})
