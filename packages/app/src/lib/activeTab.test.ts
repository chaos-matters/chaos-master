import { beforeEach, describe, expect, it, vi } from 'vitest'

// The tab lives in the URL fragment so a reload keeps you where you were.
// These pin the parts that are easy to regress: the query string surviving a
// tab switch (share links must not be destroyed by visiting Home) and the
// default staying 'workspace' for every existing entry path.
describe('activeTab URL fragment', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    // The module reads location.hash at import time, so each case needs its
    // own instance.
    vi.resetModules()
  })

  async function freshModule() {
    return await import('./activeTab')
  }

  it('defaults to workspace with no fragment', async () => {
    const { activeTab } = await freshModule()
    expect(activeTab()).toBe('workspace')
  })

  it('starts on home when the fragment says so', async () => {
    window.history.replaceState(null, '', '/#home')
    const { activeTab } = await freshModule()
    expect(activeTab()).toBe('home')
  })

  it('writes and clears the fragment as the tab changes', async () => {
    const { setActiveTab } = await freshModule()
    setActiveTab('home')
    expect(window.location.hash).toBe('#home')
    setActiveTab('workspace')
    expect(window.location.hash).toBe('')
  })

  it('preserves a share link query string across a tab switch', async () => {
    window.history.replaceState(null, '', '/?s=abc12345')
    const { setActiveTab } = await freshModule()
    setActiveTab('home')
    // Losing this would silently destroy the shared flame on the way to Home.
    expect(window.location.search).toBe('?s=abc12345')
    expect(window.location.hash).toBe('#home')
    setActiveTab('workspace')
    expect(window.location.search).toBe('?s=abc12345')
  })

  it('follows a fragment changed by the back button', async () => {
    const { activeTab } = await freshModule()
    window.history.replaceState(null, '', '/#home')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(activeTab()).toBe('home')
  })
})
