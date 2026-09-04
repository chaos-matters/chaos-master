import { cleanup, render } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPilotFocus, notePilotFocus } from '@/arcade/pilotFocus'
import { PilotSpotlight } from './PilotSpotlight'
import type { ReplayFocusPreparation } from '@/recorder/focusPreparation'
import type { RecordedAction } from '@/recorder/schema'

/**
 * The live spotlight's contract: while the AI drives, a ring says WHICH
 * control each step moved, resolved through the same hints replay uses. It
 * must survive an agent that fires its steps as fast as its tool loop allows
 * — six inside 26ms in a real lesson — without turning into a strobe.
 */

/**
 * One agent step. The id is deliberately unknown to the focus table, so these
 * tests drive the ring from the hint alone; the derivation from a real command
 * id gets its own test below.
 */
function step(focus: string | undefined): RecordedAction {
  return { t: 0, id: 'pilot.test', args: [], focus }
}

/** Give a control a size, so `resolveFocusElement` accepts it in jsdom. */
function sized(element: HTMLElement, box: Partial<DOMRect> = {}): HTMLElement {
  const rect = { x: 10, y: 20, width: 120, height: 30, ...box }
  element.getBoundingClientRect = () => ({
    ...rect,
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
    toJSON: () => rect,
  })
  return element
}

function control(path: string, box?: Partial<DOMRect>): HTMLElement {
  const element = document.createElement('div')
  element.setAttribute('data-parameter-path', path)
  document.body.append(element)
  return sized(element, box)
}

function ring(): HTMLElement | null {
  return document.querySelector('[aria-hidden="true"][style*="left"]')
}

/** Run every timer and the frame the tracker schedules after it. */
function settle(ms: number): void {
  vi.advanceTimersByTime(ms)
}

describe('PilotSpotlight', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Frame callbacks run as timers so the rect tracker advances in step with
    // the settle timeout instead of hanging on a real vsync jsdom never fires.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      setTimeout(() => {
        cb(globalThis.performance.now())
      }, 16),
    )
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      clearTimeout(id)
    })
  })

  afterEach(() => {
    cleanup()
    clearPilotFocus()
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('rings the control the step moved, where that control actually is', () => {
    control('gamma', { x: 40, y: 60, width: 200, height: 24 })
    render(() => <PilotSpotlight />)

    notePilotFocus(step('param:gamma'), 'Set Gamma 2.4')
    settle(200)

    const frame = ring()
    expect(frame).not.toBeNull()
    expect(frame?.style.left).toBe('40px')
    expect(frame?.style.top).toBe('60px')
    expect(frame?.style.width).toBe('200px')
    expect(frame?.style.height).toBe('24px')
    expect(frame?.textContent).toBe('Set Gamma 2.4')
  })

  it('opens whatever has to be open before it measures', () => {
    const prepared: ReplayFocusPreparation[] = []
    control('transform.t1.probability')
    render(() => (
      <PilotSpotlight onPrepareFocus={(p) => void prepared.push(p)} />
    ))

    notePilotFocus(step('param:transform.t1.probability'), 'Set Weight t1 0.50')
    settle(200)

    // The same preparation replay derives, so the live view and the replay of
    // the same take reveal the same panels.
    expect(prepared).toHaveLength(1)
    expect(prepared[0]?.sidebar).toBeDefined()
  })

  it('scrolls the control into view before ringing it', () => {
    const element = control('gamma')
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView')
    render(() => <PilotSpotlight />)

    notePilotFocus(step('param:gamma'), 'Set Gamma 2.4')
    settle(200)

    // A control scrolled out of a sidebar would otherwise get a ring drawn
    // over whatever happens to sit at its stale coordinates.
    expect(scrolled.mock.instances).toContain(element)
    scrolled.mockRestore()
  })

  it('holds one ring through a burst and lands on the last step', () => {
    control('gamma', { x: 40, y: 60 })
    control('exposure', { x: 300, y: 90 })
    control('contrast', { x: 500, y: 120 })
    render(() => <PilotSpotlight />)

    // An agent's three tool calls inside a single frame.
    notePilotFocus(step('param:gamma'), 'Set Gamma 2.4')
    notePilotFocus(step('param:exposure'), 'Set Exposure 0.42')
    notePilotFocus(step('param:contrast'), 'Set Contrast 1.1')
    settle(200)

    // First ring stays put: retargeting three times in 0ms is a strobe.
    expect(ring()?.style.left).toBe('40px')

    // When its dwell expires the ring goes to the LAST step, never the middle
    // one — the agent's final position is the one worth showing.
    settle(800)
    expect(ring()?.style.left).toBe('500px')
  })

  it('retires the ring for a step no hint can place', () => {
    control('gamma')
    render(() => <PilotSpotlight />)

    notePilotFocus(step('param:gamma'), 'Set Gamma 2.4')
    settle(200)
    expect(ring()).not.toBeNull()

    notePilotFocus(step(undefined), 'Saved the flame')
    settle(1000)
    // Leaving the ring where it was would claim the AI touched gamma again.
    expect(ring()).toBeNull()
  })

  it('drops the ring the moment the pilot ends, dwell or no dwell', () => {
    control('gamma')
    render(() => <PilotSpotlight />)

    notePilotFocus(step('param:gamma'), 'Set Gamma 2.4')
    settle(200)
    expect(ring()).not.toBeNull()

    clearPilotFocus()
    expect(ring()).toBeNull()
  })

  it('says nothing rather than framing a control that is not on screen', () => {
    render(() => <PilotSpotlight />)

    notePilotFocus(step('param:nowhere'), 'Set Something 1')
    settle(1000)

    expect(ring()).toBeNull()
  })

  it('derives the target from the command, not just the saved hint', () => {
    control('gamma', { x: 40, y: 60 })
    render(() => <PilotSpotlight />)

    // No `focus` on the action at all: the id and args are enough, which is
    // what lets the live ring and replay agree about an old session whose
    // hints predate the current vocabulary.
    notePilotFocus({ t: 0, id: 'flame.setGamma', args: [2.4] }, 'Set Gamma 2.4')
    settle(200)

    expect(ring()?.style.left).toBe('40px')
  })

  it('points at the list when the row it named is gone', () => {
    const list = document.createElement('div')
    list.setAttribute('data-tour-target', 'transform-list')
    document.body.append(list)
    sized(list, { x: 12, y: 300, width: 260, height: 400 })
    render(() => <PilotSpotlight />)

    // The action still names the transform it deleted. Ringing that row would
    // frame a control that no longer exists, so the derivation moves up to the
    // list — the same upgrade replay applies.
    notePilotFocus(
      { t: 0, id: 'flame.removeTransform', args: ['t1'], focus: 'focus:tx:t1' },
      'Delete transform t1',
    )
    settle(200)

    expect(ring()?.style.left).toBe('12px')
    expect(ring()?.style.height).toBe('400px')
  })

  it('follows a control that moves while the ring is on it', () => {
    const element = control('gamma', { x: 40, y: 60 })
    render(() => <PilotSpotlight />)

    notePilotFocus(step('param:gamma'), 'Set Gamma 2.4')
    settle(200)
    expect(ring()?.style.left).toBe('40px')

    // A panel opening above it, a sidebar scrolling: the ring has to keep up
    // or it points at empty space.
    sized(element, { x: 240, y: 60 })
    settle(100)
    expect(ring()?.style.left).toBe('240px')
  })
})
