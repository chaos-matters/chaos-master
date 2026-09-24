/**
 * The history hold's bookkeeping, on its own.
 *
 * happy-dom does not traverse history the way a browser does, so the Back,
 * Forward and fragment navigations themselves are checked in the real app
 * (tests/pilot-lock-history.ci.spec.ts). Here: one guard entry however many
 * holds, the newest hold hears a held navigation, the app's hashchange
 * listeners hear nothing while held, and a hold handed over in the same
 * update keeps the guard.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { holdHistory } from './historyHold'

const isGuard = () =>
  typeof history.state === 'object' &&
  history.state !== null &&
  'historyHold' in (history.state as object)
const settle = () =>
  new Promise<void>((resolve) => {
    queueMicrotask(resolve)
  })
const popstate = () => window.dispatchEvent(new PopStateEvent('popstate'))
const hashchange = () => window.dispatchEvent(new HashChangeEvent('hashchange'))

const releases: (() => void)[] = []
const hold = (onBack?: () => void) => {
  const release = holdHistory(onBack)
  releases.push(release)
  return release
}

afterEach(async () => {
  for (const release of releases.splice(0)) release()
  await settle()
})

describe('holdHistory', () => {
  it('puts one guard entry on history, however many hold it', () => {
    const before = history.length

    hold()
    hold()

    expect(history.length).toBe(before + 1)
    expect(isGuard()).toBe(true)
  })

  it('tells the newest hold of a held navigation, and no older one', () => {
    const older = vi.fn()
    const newer = vi.fn()
    hold(older)
    hold(newer)

    popstate()

    expect(newer).toHaveBeenCalledOnce()
    expect(older).not.toHaveBeenCalled()
    expect(isGuard()).toBe(true)
  })

  it('keeps hashchange from the app while held, and only then', async () => {
    const app = vi.fn()
    window.addEventListener('hashchange', app)
    const release = hold()

    hashchange()
    expect(app).not.toHaveBeenCalled()

    release()
    await settle()
    hashchange()
    expect(app).toHaveBeenCalledOnce()
    window.removeEventListener('hashchange', app)
  })

  it('keeps the guard when one hold hands over to the next', async () => {
    const before = history.length
    const lock = hold()

    lock()
    const card = hold()
    await settle()

    expect(isGuard()).toBe(true)
    expect(history.length).toBe(before + 1)
    card()
  })

  it('does nothing on a navigation with no hold', () => {
    const state: unknown = history.state
    const length = history.length

    popstate()

    expect(history.state).toBe(state)
    expect(history.length).toBe(length)
  })
})
