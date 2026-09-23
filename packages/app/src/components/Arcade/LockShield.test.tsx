/**
 * Keys and back under the Arcade's screen lock.
 *
 * The focus is always in the shield while the agent drives, so every key
 * starts there. Window and document listeners across the app used to act on
 * them anyway: the lock was theatre for any listener that did not ask
 * whether the pilot owned the keyboard. So the keys stop at the shield, one
 * catch-all rather than a guard in every listener, and what the shield's own
 * controls handle, Solid's delegated handlers included, still reaches them.
 * The pilot's Esc-twice listens in the capture phase, above the shield, and
 * keeps working; the theme chord stays the viewer's (maff's call).
 *
 * Back (the Android button, or the iOS edge swipe on Home) pops the app's
 * back registry, which closed panels and layers under the lock, and with
 * nothing to close it sent the app to the background. Under the screen lock
 * it does nothing at all; on the end card after it, it closes the card.
 *
 * A seat lock (a duel) draws no shield: the viewer is playing, and keeps
 * every key and back.
 */
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { endPilot, notePilotStep, pilot, resetPilot, startPilot, } from '@/arcade/pilot'
import { popBack, pushBackHandler } from '@/lib/backStack'
import { useLifecyclePorts } from '@/lib/lifecycle'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { LockShield } from './LockShield'
import { PilotOverlay } from './PilotOverlay'
import type { LifecyclePorts } from '@chaos-master/mobile-runtime/lifecycle'

vi.mock('./PilotSpotlight', () => ({ PilotSpotlight: () => null }))

const LOCK = 'The agent is driving the editor'
const STOP = 'Stop the agent and keep what was recorded'

function drive(lock: 'screen' | 'seat') {
  startPilot({
    mode: lock === 'screen' ? 'cinema' : 'duel',
    title: 'Animating your flame',
    stepBudget: 25,
    allowed: ['timeline.'],
    qualityRankAtStart: 1,
    seatId: lock === 'screen' ? 'player' : 'rival',
    lock,
  })
}

/** What the page's own window and document listeners heard. */
function listenLikeTheApp() {
  const heard: string[] = []
  const hear = (where: string) => (ev: Event) => {
    heard.push(`${where} ${ev.type} ${(ev as KeyboardEvent).key}`)
  }
  const onWindow = hear('window')
  const onDocument = hear('document')
  for (const type of ['keydown', 'keyup']) {
    window.addEventListener(type, onWindow)
    document.addEventListener(type, onDocument)
  }
  return {
    heard,
    stop: () => {
      for (const type of ['keydown', 'keyup']) {
        window.removeEventListener(type, onWindow)
        document.removeEventListener(type, onDocument)
      }
    },
  }
}

const press = (target: Element, key: string, init: KeyboardEventInit = {}) => {
  const down = new KeyboardEvent('keydown', { key, bubbles: true, ...init })
  target.dispatchEvent(down)
  target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  return down
}

let app: ReturnType<typeof listenLikeTheApp> | undefined

afterEach(() => {
  app?.stop()
  app = undefined
  cleanup()
  resetPilot()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('keys under the screen lock', () => {
  it('reach no window or document listener past the shield', () => {
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    app = listenLikeTheApp()
    drive('screen')
    const lock = screen.getByRole('dialog', { name: LOCK })

    press(lock, 'Delete')
    press(screen.getByRole('button', { name: STOP }), 'Enter')
    press(lock, 'Escape')

    expect(app.heard).toEqual([])
    // The first Escape still arms the pilot's Esc-twice, which listens above.
    expect(screen.getByRole('button', { name: STOP }).textContent).toContain(
      'Esc again',
    )
  })

  it('still reach what the shield itself handles, Solid handlers included, once', () => {
    const inside = vi.fn()
    app = listenLikeTheApp()
    render(() => (
      <LockShield label={LOCK} onRelease={() => {}}>
        <button type="button" onKeyDown={(ev) => inside(ev.key)}>
          Inside
        </button>
      </LockShield>
    ))

    press(screen.getByRole('button', { name: 'Inside' }), 'Delete')
    press(screen.getByRole('button', { name: 'Inside' }), 'd', {
      code: 'KeyD',
      ctrlKey: true,
    })

    expect(inside.mock.calls).toEqual([['Delete'], ['d']])
    expect(app.heard).toEqual(['document keydown d', 'window keydown d'])
  })

  it('leave the theme chord to the page, claimed or not', () => {
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    const claim = (ev: KeyboardEvent) => {
      if (ev.key === 'd' && ev.ctrlKey) ev.preventDefault()
    }
    document.addEventListener('keydown', claim)
    drive('screen')

    const chord = press(screen.getByRole('dialog', { name: LOCK }), 'd', {
      code: 'KeyD',
      ctrlKey: true,
      cancelable: true,
    })
    document.removeEventListener('keydown', claim)

    expect(chord.defaultPrevented).toBe(true)
  })

  it('reach the page again once the lock is gone', () => {
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    app = listenLikeTheApp()
    drive('screen')
    const lock = screen.getByRole('dialog', { name: LOCK })
    resetPilot()

    press(lock.ownerDocument.body, 'Delete')

    expect(app.heard).toEqual([
      'document keydown Delete',
      'window keydown Delete',
      'document keyup Delete',
      'window keyup Delete',
    ])
  })

  it('end the take through Esc-twice across the agent’s steps', () => {
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    drive('screen')
    const lock = screen.getByRole('dialog', { name: LOCK })
    // A capture listener added after the lock that claims Escape, as Home's
    // did when the address bar opened it mid-take.
    const claim = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') ev.stopImmediatePropagation()
    }
    document.addEventListener('keydown', claim, true)

    notePilotStep('command', 'Exposure 0.3')
    press(lock, 'Escape')
    notePilotStep('command', 'Exposure 0.4')
    const armed = screen.getByRole('button', { name: STOP }).textContent
    press(lock, 'Escape')
    document.removeEventListener('keydown', claim, true)

    expect(armed).toContain('Esc again')
    expect(pilot().phase).toBe('ended')
  })

  it('are the viewer’s under a seat lock', () => {
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    app = listenLikeTheApp()
    drive('seat')

    fireEvent.keyDown(document.body, { key: 'Delete' })

    expect(app.heard).toEqual([
      'document keydown Delete',
      'window keydown Delete',
    ])
  })
})

/** The platform's back button, as lib/lifecycle.ts hears it. */
function backButton() {
  const backs = new Set<() => void>()
  const minimizeApp = vi.fn(() => Promise.resolve())
  const ports: LifecyclePorts = {
    onBackButton: (callback) => {
      backs.add(callback)
      return () => backs.delete(callback)
    },
    onPause: () => () => {},
    onResume: () => () => {},
    minimizeApp,
  }
  useLifecyclePorts(ports)
  return {
    minimizeApp,
    press: () => {
      backs.forEach((callback) => {
        callback()
      })
    },
  }
}

describe('back under the screen lock', () => {
  it('closes nothing and does not send the app away', () => {
    const back = backButton()
    const closed: string[] = []
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    const drawer = pushBackHandler(() => closed.push('drawer'), 'drawer')
    drive('screen')
    // A panel the agent opened mid-take is the newest layer.
    const panel = pushBackHandler(() => closed.push('panel'), 'panel')

    back.press()

    expect(closed).toEqual([])
    expect(back.minimizeApp).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: LOCK })).toBeTruthy()

    panel()
    resetPilot()
    back.press()
    expect(closed).toEqual(['drawer'])
    drawer()
  })

  it('closes the end card after the take, and nothing under it', () => {
    const back = backButton()
    const closed: string[] = []
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    const drawer = pushBackHandler(() => closed.push('drawer'), 'drawer')
    drive('screen')
    endPilot('stopped', { title: 'Warm tones' })
    expect(screen.getByRole('dialog', { name: /Stopped by you/ })).toBeTruthy()

    back.press()

    expect(pilot().phase).toBe('idle')
    expect(closed).toEqual([])
    expect(back.minimizeApp).not.toHaveBeenCalled()
    back.press()
    expect(closed).toEqual(['drawer'])
    drawer()
  })

  it('is the viewer’s under a seat lock', () => {
    const closed = vi.fn()
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    const drawer = pushBackHandler(closed, 'drawer')
    drive('seat')

    expect(popBack()).toBe(true)
    expect(closed).toHaveBeenCalledTimes(1)
    drawer()
  })
})
