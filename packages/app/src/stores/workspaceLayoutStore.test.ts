import { createRoot } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'
import { classifyLayout, createWorkspaceLayoutStore, deckFits, deckFitsWidth, isTouchLayout, isWideLayout, screenShortEdge, WIDE_LAYOUT_MIN_WIDTH, } from './workspaceLayoutStore'

/** The store derives its class from one resize listener, so tests drive that. */
function resizeTo(width: number, height: number) {
  window.innerWidth = width
  window.innerHeight = height
  window.dispatchEvent(new Event('resize'))
}

/** The screen the window sits on. It does not move when the keyboard opens. */
function screenIs(width: number, height: number) {
  Object.defineProperty(window.screen, 'width', {
    value: width,
    configurable: true,
  })
  Object.defineProperty(window.screen, 'height', {
    value: height,
    configurable: true,
  })
}

const touch = (width: number, height: number) =>
  classifyLayout({
    width,
    height,
    shortEdge: Math.min(width, height),
    coarse: true,
    native: true,
    preference: 'auto',
  })

describe('classifyLayout on a device', () => {
  it.each([
    [393, 852, 'phone', false],
    [852, 393, 'phone', false],
    [412, 915, 'phone', false],
    [455, 1210, 'phone', false],
    [834, 1210, 'tablet', false],
    [1210, 834, 'tablet', true],
    [800, 1280, 'tablet', false],
    [1280, 800, 'tablet', true],
    [1024, 1366, 'tablet', true],
    [1366, 1024, 'tablet', true],
  ])('%i x %i is %s, deck %s', (width, height, expected, deck) => {
    expect(touch(width, height)).toBe(expected)
    expect(deckFitsWidth(width)).toBe(deck)
  })

  it('never returns desktop while native', () => {
    for (const width of [680, 900, 1024, 1366, 2000]) {
      expect(
        classifyLayout({
          width,
          height: 1000,
          shortEdge: Math.min(width, 1000),
          coarse: false,
          native: true,
          preference: 'auto',
        }),
      ).not.toBe('desktop')
    }
  })
})

describe('classifyLayout while the soft keyboard is open', () => {
  // `interactive-widget=resizes-content` shrinks the window, not the screen.
  const withKeyboard = (width: number, height: number, shortEdge: number) =>
    classifyLayout({
      width,
      height,
      shortEdge,
      coarse: true,
      native: true,
      preference: 'auto',
    })

  it('keeps a landscape tablet a tablet', () => {
    expect(withKeyboard(1280, 800, 800)).toBe('tablet')
    expect(withKeyboard(1280, 450, 800)).toBe('tablet')
  })

  it('keeps a rotated phone a phone', () => {
    expect(withKeyboard(852, 393, 393)).toBe('phone')
    expect(withKeyboard(852, 220, 393)).toBe('phone')
  })
})

describe('classifyLayout on the web', () => {
  const web = (width: number, height: number) =>
    classifyLayout({
      width,
      height,
      shortEdge: 1440,
      coarse: false,
      native: false,
      preference: 'auto',
    })

  it('keeps the width rules for a fine pointer', () => {
    expect(web(600, 900)).toBe('phone')
    expect(web(900, 700)).toBe('tablet')
    expect(web(1024, 700)).toBe('tablet')
    expect(web(1025, 700)).toBe('desktop')
    expect(web(1440, 900)).toBe('desktop')
  })

  it('treats a coarse pointer like a device', () => {
    expect(
      classifyLayout({
        width: 1280,
        height: 800,
        shortEdge: 800,
        coarse: true,
        native: false,
        preference: 'auto',
      }),
    ).toBe('tablet')
  })

  it('honours the preference', () => {
    expect(
      classifyLayout({
        width: 393,
        height: 852,
        shortEdge: 393,
        coarse: true,
        native: true,
        preference: 'desktop',
      }),
    ).toBe('desktop')
    expect(
      classifyLayout({
        width: 1440,
        height: 900,
        shortEdge: 1440,
        coarse: false,
        native: false,
        preference: 'touch',
      }),
    ).toBe('tablet')
    expect(
      classifyLayout({
        // A desktop browser forced into the touch layout: its window is a
        // fraction of its screen, so the window is what it is measured by.
        width: 500,
        height: 900,
        shortEdge: 1440,
        coarse: false,
        native: false,
        preference: 'touch',
      }),
    ).toBe('phone')
  })
})

describe('workspaceLayoutStore', () => {
  it('respects wide layout parameter on initialization', () => {
    createRoot((dispose) => {
      const wideStore = createWorkspaceLayoutStore(true)
      expect(wideStore.sidebarHidden()).toBe(false)
      expect(wideStore.showTimeline()).toBe(true)

      const narrowStore = createWorkspaceLayoutStore(false)
      expect(narrowStore.sidebarHidden()).toBe(true)
      expect(narrowStore.showTimeline()).toBe(false)
      dispose()
    })
  })

  it('toggles sidebar and cards properly', () => {
    createRoot((dispose) => {
      const store = createWorkspaceLayoutStore(true)
      expect(store.affineCardOpen()).toBe(true)
      store.setAffineCardOpen(false)
      expect(store.affineCardOpen()).toBe(false)

      expect(store.randomizerOpen()).toBe(false)
      store.setRandomizerOpen(true)
      expect(store.randomizerOpen()).toBe(true)

      expect(store.randomizerAnimEpoch()).toBe(0)
      store.setRandomizerAnimEpoch(1)
      expect(store.randomizerAnimEpoch()).toBe(1)
      dispose()
    })
  })

  it('calculates sidebarWidth and floating actions position', () => {
    createRoot((dispose) => {
      const store = createWorkspaceLayoutStore(true)
      expect(store.sidebarWidth()).toBe(26)
      store.setSidebarLayoutMode('compact')
      expect(store.sidebarWidth()).toBe(21)
      expect(store.floatingTop()).toBe(8)
      dispose()
    })
  })

  it('determines isWideLayout correctly', () => {
    expect(typeof isWideLayout()).toBe('boolean')
    expect(WIDE_LAYOUT_MIN_WIDTH).toBe(769)
  })

  it('provides phone and tablet layout signals and constants', () => {
    createRoot((dispose) => {
      const store = createWorkspaceLayoutStore()
      expect(typeof store.isPhone()).toBe('boolean')
      expect(typeof store.isTablet()).toBe('boolean')
      expect(typeof store.isTouchLayout()).toBe('boolean')
      expect(typeof isTouchLayout()).toBe('boolean')
      resizeTo(500, 900)
      expect(store.isPhone()).toBe(true)
      expect(store.isTouchLayout()).toBe(true)
      expect(isTouchLayout()).toBe(true)
      resizeTo(900, 700)
      expect(store.isTablet()).toBe(true)
      expect(store.isTouchLayout()).toBe(true)
      expect(deckFits()).toBe(true)

      // Test manual touch preference override
      store.setTouchLayoutPreference('desktop')
      expect(store.isPhone()).toBe(false)
      expect(store.isTablet()).toBe(false)
      expect(store.isTouchLayout()).toBe(false)
      expect(isTouchLayout()).toBe(false)

      store.setTouchLayoutPreference('touch')
      resizeTo(1440, 900)
      expect(store.isTablet()).toBe(true)
      expect(store.isTouchLayout()).toBe(true)
      expect(isTouchLayout()).toBe(true)

      store.setTouchLayoutPreference('auto')
      resizeTo(1024, 768)
      dispose()
    })
  })

  it('measures the short edge on the screen, not on the window', () => {
    screenIs(1280, 800)
    // The variation search is focused and the keyboard takes half the window.
    resizeTo(1280, 450)
    expect(screenShortEdge()).toBe(800)
    // No usable screen: the window is the honest measure.
    screenIs(0, 0)
    expect(screenShortEdge()).toBe(450)
    screenIs(1024, 768)
    resizeTo(1024, 768)
  })

  it('creates its module-level memos inside a root, so Solid does not warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      vi.resetModules()
      await import('./workspaceLayoutStore')
      const offending = warn.mock.calls
        .map((c) => c.map(String).join(' '))
        .filter((m) => /never be disposed|createRoot/i.test(m))
      expect(offending).toEqual([])
    } finally {
      warn.mockRestore()
    }
  })
})
