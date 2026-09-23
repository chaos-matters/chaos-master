/**
 * The 3D camera's own input under an Arcade lock.
 *
 * The camera listens on `window`, in the capture phase, for its movement keys
 * (W, A, S, D and the arrows) and, while flying, for Q, E, C and Space; with
 * the pointer locked it turns on raw mouse movement. None of that asked who
 * owns the screen, so a viewer watching a take could pan the camera under
 * the agent, and the pan landed in the document as a "Camera pan" history
 * entry that no recorded command made: an uncaptured write in the take.
 *
 * A seat lock is the duel, where the viewer flies their own seat's camera and
 * keeps every key; with no lock at all the keys are the viewer's as always.
 */
import { cleanup, render } from '@solidjs/testing-library'
import { createStore } from 'solid-js/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetPilot, startPilot } from '@/arcade/pilot'
import { ChangeHistoryContextProvider } from '@/contexts/ChangeHistoryContext'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { createSpherical, WheelZoomCamera3D } from './WheelZoomCamera3D'

// The camera's GPU half is not under test: only its input handling is.
vi.mock('@/lib/Camera3D', () => ({
  Camera3D: (props: { children?: unknown }) => props.children,
}))
vi.mock('@/lib/Camera3DContext', () => ({
  useCamera3D: () => ({ js: { worldToClip: (pos: unknown) => pos } }),
}))
vi.mock('@/lib/CanvasContext', () => ({
  useCanvas: () => ({ canvas: document.createElement('canvas') }),
}))

function drive(lock: 'screen' | 'seat') {
  startPilot({
    mode: lock === 'screen' ? 'cinema' : 'duel',
    title: 'Driving',
    stepBudget: 10,
    allowed: ['flame.'],
    qualityRankAtStart: 1,
    seatId: lock === 'screen' ? 'player' : 'rival',
    lock,
  })
}

/** The camera over a real history, with the history's preview start spied
 *  on: a camera key that acts opens a "Camera pan" preview synchronously. */
function mountCamera(options: { flying?: boolean } = {}) {
  const [, , history] = createStoreHistory(
    createStore(deepClone(examples.example1)),
  )
  const startPreview = vi.spyOn(history, 'startPreview')
  const surface = document.createElement('div')
  document.body.append(surface)
  const spherical = createSpherical(
    0,
    Math.PI / 2,
    4,
    new Float32Array([0, 0, 0]),
    1,
  )
  render(() => (
    <ChangeHistoryContextProvider value={history}>
      <WheelZoomCamera3D
        theta={spherical.theta}
        phi={spherical.phi}
        radius={spherical.radius}
        target={spherical.target}
        fov={spherical.fov}
        roll={spherical.roll}
        eventTarget={surface}
        flyMode={() => options.flying === true}
      />
    </ChangeHistoryContextProvider>
  ))
  return { startPreview, surface, spherical }
}

function key(type: 'keydown' | 'keyup', k: string): KeyboardEvent {
  const ev = new KeyboardEvent(type, {
    key: k,
    bubbles: true,
    cancelable: true,
  })
  document.body.dispatchEvent(ev)
  return ev
}

/** Press and release, so a key that did act leaves no loop running. */
function tap(k: string): KeyboardEvent {
  const ev = key('keydown', k)
  key('keyup', k)
  return ev
}

const MOVE_KEYS = [
  'w',
  'a',
  's',
  'd',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]
const FLY_KEYS = ['q', 'e', 'c', ' ']

afterEach(() => {
  cleanup()
  resetPilot()
  document.body.replaceChildren()
  Reflect.deleteProperty(document, 'pointerLockElement')
})

describe('the 3D camera under an Arcade lock', () => {
  it.each(MOVE_KEYS)(
    '%s moves nothing and opens no history entry while the agent owns the screen',
    (k) => {
      const { startPreview } = mountCamera()
      drive('screen')

      const ev = tap(k)

      expect(startPreview).not.toHaveBeenCalled()
      expect(ev.defaultPrevented).toBe(false)
    },
  )

  it.each(FLY_KEYS)(
    'the fly key %j moves nothing and is not swallowed while the agent owns the screen',
    (k) => {
      const { startPreview } = mountCamera({ flying: true })
      drive('screen')
      // Where the rest of the app listens. Flying, the camera stops the key
      // from going any further, which is also what kept a focused Stop
      // button from getting its Space.
      const later = vi.fn()
      document.addEventListener('keydown', later)
      try {
        const ev = tap(k)
        expect(ev.defaultPrevented).toBe(false)
      } finally {
        document.removeEventListener('keydown', later)
      }

      expect(startPreview).not.toHaveBeenCalled()
      expect(later).toHaveBeenCalledTimes(1)
    },
  )

  it('lets go of a key held when the lock starts', () => {
    const { startPreview } = mountCamera()
    key('keydown', 'w')
    expect(startPreview).toHaveBeenCalledWith('Camera pan')
    drive('screen')

    // The browser repeats a held key. The first repeat under the lock drops
    // it, so the pan stops instead of running until the key comes up.
    const repeat = key('keydown', 'w')

    expect(repeat.defaultPrevented).toBe(false)
    expect(startPreview).toHaveBeenCalledTimes(1)
    key('keyup', 'w')
  })

  it('does not turn on mouse movement under a pointer lock while the agent owns the screen', () => {
    const { startPreview, surface } = mountCamera({ flying: true })
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => surface,
    })
    const exitPointerLock = vi.fn()
    document.exitPointerLock = exitPointerLock
    drive('screen')

    document.dispatchEvent(
      new MouseEvent('mousemove', { movementX: 40, movementY: 10 }),
    )

    expect(startPreview).not.toHaveBeenCalled()
    // And the pointer is given back rather than held for the whole take.
    expect(exitPointerLock).toHaveBeenCalled()
  })

  it('keeps every camera key with the lock off', () => {
    const { startPreview } = mountCamera()

    const ev = tap('w')

    expect(ev.defaultPrevented).toBe(true)
    expect(startPreview).toHaveBeenCalledWith('Camera pan')
  })

  it('keeps every camera key for the viewer flying their own seat in a duel', () => {
    const { startPreview } = mountCamera({ flying: true })
    drive('seat')

    const ev = tap(' ')

    expect(ev.defaultPrevented).toBe(true)
    expect(startPreview).toHaveBeenCalledWith('Camera pan')
  })
})
