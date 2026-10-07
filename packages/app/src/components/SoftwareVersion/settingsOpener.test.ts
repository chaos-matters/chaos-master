/**
 * The welcome screen's version pill opens Settings and more through the
 * version menu's own opener (settingsOpener.ts), whether or not the editor
 * has mounted yet.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openSettings, provideSettingsOpener } from './settingsOpener'

describe('openSettings', () => {
  const withdrawals: (() => void)[] = []
  const provide = (open: () => void) => {
    withdrawals.push(provideSettingsOpener(open))
  }
  afterEach(() => {
    for (const withdraw of withdrawals.splice(0)) withdraw()
  })

  it('runs the opener the version menu provided', () => {
    const open = vi.fn()
    provide(open)
    openSettings()
    expect(open).toHaveBeenCalledOnce()
  })

  it('waits for an opener when asked before the editor mounted', () => {
    openSettings()
    const open = vi.fn()
    provide(open)
    expect(open).toHaveBeenCalledOnce()

    // Once: a later mount does not open it again.
    const later = vi.fn()
    provide(later)
    expect(later).not.toHaveBeenCalled()
  })

  it('stops running an opener once it is withdrawn', () => {
    const open = vi.fn()
    provideSettingsOpener(open)()
    openSettings()
    expect(open).not.toHaveBeenCalled()
    // The request waits for the next opener instead.
    const next = vi.fn()
    provide(next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('leaves a newer opener in place when an older one is withdrawn', () => {
    const older = vi.fn()
    const withdrawOlder = provideSettingsOpener(older)
    const newer = vi.fn()
    provide(newer)
    withdrawOlder()
    openSettings()
    expect(newer).toHaveBeenCalledOnce()
    expect(older).not.toHaveBeenCalled()
  })
})
