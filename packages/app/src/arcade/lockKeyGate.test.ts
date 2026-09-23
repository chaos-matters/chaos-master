/**
 * The screen lock's key gate, on its own.
 *
 * It is the first key listener on the page, so every listener a test adds
 * after it stands for the app's: window and document, capture and bubble.
 * Under the screen lock none of them hears a key but the theme chord, the
 * lock's own listener hears the keydowns, and no default is prevented. With
 * no lock, or a seat lock, every listener hears every key, as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hearLockedKeys, installLockKeyGate, isThemeChord } from './lockKeyGate'
import { resetPilot, startPilot } from './pilot'

function lock(scope: 'screen' | 'seat' = 'screen') {
  startPilot({
    mode: scope === 'screen' ? 'cinema' : 'duel',
    title: 'Driving',
    stepBudget: 10,
    allowed: ['flame.'],
    qualityRankAtStart: 1,
    seatId: scope === 'screen' ? 'player' : 'rival',
    lock: scope,
  })
}

/** Every kind of key listener the app adds, after the gate. */
function listenEverywhere() {
  const heard: string[] = []
  const removals: (() => void)[] = []
  for (const [where, target] of [
    ['window', window],
    ['document', document],
  ] as const) {
    for (const capture of [true, false]) {
      for (const type of ['keydown', 'keyup', 'keypress']) {
        const listener = (ev: Event) => {
          heard.push(
            `${where} ${capture ? 'capture' : 'bubble'} ${type} ${(ev as KeyboardEvent).key}`,
          )
        }
        target.addEventListener(type, listener, capture)
        removals.push(() => {
          target.removeEventListener(type, listener, capture)
        })
      }
    }
  }
  return {
    heard,
    /** What they heard since the last call, as `type key`, once each. */
    take: () => [
      ...new Set(
        heard.splice(0).map((line) => line.split(' ').slice(2).join(' ')),
      ),
    ],
    stop: () => {
      for (const remove of removals) remove()
    },
  }
}

const key = (type: string, init: KeyboardEventInit) => {
  const ev = new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    ...init,
  })
  document.body.dispatchEvent(ev)
  return ev
}
const press = (init: KeyboardEventInit) => [
  key('keydown', init),
  key('keypress', init),
  key('keyup', init),
]
const W = { key: 'w', code: 'KeyW' }
const ESCAPE = { key: 'Escape', code: 'Escape' }

let removeGate: () => void
let app: ReturnType<typeof listenEverywhere>

beforeEach(() => {
  removeGate = installLockKeyGate()
  app = listenEverywhere()
})

afterEach(() => {
  app.stop()
  resetPilot()
  removeGate()
})

describe('with no screen lock', () => {
  it('lets every key reach every listener, and prevents nothing', () => {
    const events = press(W)

    expect(app.heard).toHaveLength(3 * 4)
    expect(app.take()).toEqual(['keydown w', 'keypress w', 'keyup w'])
    expect(events.map((ev) => ev.defaultPrevented)).toEqual([
      false,
      false,
      false,
    ])
  })

  it('does the same under a seat lock, the viewer’s half of a duel', () => {
    lock('seat')

    press(W)

    expect(app.heard).toHaveLength(3 * 4)
  })

  it('is one gate however many times boot asks for it', () => {
    expect(installLockKeyGate()).toBe(removeGate)
    lock()

    press(W)

    expect(app.heard).toEqual([])
  })
})

describe('under the screen lock', () => {
  it('lets no key reach any listener, capture or bubble', () => {
    lock()

    for (const init of [W, ESCAPE, { key: 'Delete', code: 'Delete' }])
      press(init)

    expect(app.heard).toEqual([])
  })

  it('prevents no default, so Tab and Stop keep their keys', () => {
    lock()

    const events = [
      ...press({ key: 'Tab', code: 'Tab' }),
      ...press({ key: 'Enter', code: 'Enter' }),
      ...press({ key: ' ', code: 'Space' }),
    ]

    expect(app.heard).toEqual([])
    expect(events.some((ev) => ev.defaultPrevented)).toBe(false)
  })

  it('hands the lock’s own listener every keydown, and nothing else', () => {
    const lockHeard: string[] = []
    const release = hearLockedKeys((ev) => lockHeard.push(ev.key))
    press(W)
    app.heard.splice(0)
    lock()

    press(ESCAPE)
    press(W)
    release()
    press(ESCAPE)

    expect(lockHeard).toEqual(['Escape', 'w'])
    expect(app.heard).toEqual([])
  })

  it('lets the theme chord through, and only the chord that toggles the theme', () => {
    lock()

    press({ key: 'd', code: 'KeyD', ctrlKey: true })
    press({ key: 'd', code: 'KeyD', metaKey: true })
    expect(app.take()).toEqual(['keydown d', 'keypress d', 'keyup d'])
    expect(app.heard).toEqual([])

    press({ key: 'd', code: 'KeyD' })
    press({ key: 'd', code: 'KeyD', altKey: true })
    press({ key: 'D', code: 'KeyD', shiftKey: true })
    expect(app.heard).toEqual([])
  })

  it('is the whole key once the lock is gone', () => {
    lock()
    press(W)
    resetPilot()

    press(W)

    expect(app.take()).toEqual(['keydown w', 'keypress w', 'keyup w'])
  })
})

describe('a press belongs to whoever heard it go down', () => {
  it('releases to the page a key it heard go down, as the lock starts', () => {
    key('keydown', { ...W, shiftKey: true })
    app.heard.splice(0)
    let up: KeyboardEvent | undefined
    document.addEventListener('keyup', (ev) => (up = ev), { once: true })

    lock()

    expect(app.take()).toEqual(['keyup w'])
    expect(up).toMatchObject({ key: 'w', code: 'KeyW', shiftKey: true })
    // Its repeats and its own keyup are the lock's now.
    key('keydown', { ...W, repeat: true })
    key('keyup', W)
    expect(app.heard).toEqual([])
  })

  it('releases nothing that already came up, or went up with the window’s focus', () => {
    press(W)
    key('keydown', { key: 'a', code: 'KeyA' })
    window.dispatchEvent(new Event('blur'))
    app.heard.splice(0)

    lock()

    expect(app.heard).toEqual([])
  })

  it('keeps a key that went down under the lock until it comes up', () => {
    const onEnd = vi.fn()
    lock()
    key('keydown', ESCAPE)
    resetPilot()
    document.addEventListener('keydown', onEnd)

    const repeat = key('keydown', { ...ESCAPE, repeat: true })
    key('keyup', ESCAPE)
    expect(onEnd).not.toHaveBeenCalled()
    // Nor its default, a close request on the end card.
    expect(repeat.defaultPrevented).toBe(true)
    expect(app.heard).toEqual([])

    press(ESCAPE)
    expect(onEnd).toHaveBeenCalledOnce()
    document.removeEventListener('keydown', onEnd)
  })

  it('gives the page a new press of it when its keyup never came', () => {
    lock()
    key('keydown', W)
    resetPilot()

    key('keydown', W)

    expect(app.take()).toEqual(['keydown w'])
  })
})

describe('isThemeChord', () => {
  it('is Ctrl or Cmd with D, by the physical key, whatever else is held', () => {
    const chord = (init: KeyboardEventInit) =>
      isThemeChord(new KeyboardEvent('keydown', init))

    expect(chord({ key: 'd', code: 'KeyD', ctrlKey: true })).toBe(true)
    expect(chord({ key: 'd', code: 'KeyD', metaKey: true })).toBe(true)
    expect(
      chord({ key: 'D', code: 'KeyD', ctrlKey: true, shiftKey: true }),
    ).toBe(true)
    expect(chord({ key: 'd', code: 'KeyD' })).toBe(false)
    expect(chord({ key: 'd', code: 'KeyD', altKey: true })).toBe(false)
    expect(chord({ key: 'd', code: 'KeyE', ctrlKey: true })).toBe(false)
  })
})
