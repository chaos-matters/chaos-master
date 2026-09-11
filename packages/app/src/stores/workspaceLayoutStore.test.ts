import { createRoot } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceLayoutStore, isTouchLayout, isWideLayout, WIDE_LAYOUT_MIN_WIDTH, } from './workspaceLayoutStore'

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
      store.setIsPhone(true)
      expect(store.isPhone()).toBe(true)
      expect(store.isTouchLayout()).toBe(true)
      expect(isTouchLayout()).toBe(true)
      store.setIsTablet(true)
      expect(store.isTablet()).toBe(true)
      expect(store.isTouchLayout()).toBe(true)

      // Test manual touch preference override
      store.setTouchLayoutPreference('desktop')
      expect(store.isPhone()).toBe(false)
      expect(store.isTablet()).toBe(false)
      expect(store.isTouchLayout()).toBe(false)
      expect(isTouchLayout()).toBe(false)

      store.setTouchLayoutPreference('touch')
      store.setIsPhone(false)
      expect(store.isTablet()).toBe(true)
      expect(store.isTouchLayout()).toBe(true)
      expect(isTouchLayout()).toBe(true)

      store.setTouchLayoutPreference('auto')
      dispose()
    })
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
