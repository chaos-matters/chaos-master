import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { endPilot, notePilotSaveResult, resetPilot, startPilot, } from '@/arcade/pilot'
import { clearPilotFocus, notePilotFocus } from '@/arcade/pilotFocus'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { PilotOverlay } from './PilotOverlay'
import type { RecordedAction, RecordedSession } from '@/recorder/schema'

const take = {
  version: 1,
  actions: [{ t: 0, id: 'flame.setExposure', args: [0.3] }],
} as unknown as RecordedSession

function endCinema() {
  startPilot({
    mode: 'cinema',
    title: 'Animating your flame',
    stepBudget: 25,
    allowed: ['timeline.'],
    qualityRankAtStart: 1,
  })
  endPilot('finished', {
    title: 'Pendulum waltz',
    sessionName: 'Cinema: Pendulum waltz',
    session: take,
  })
  notePilotSaveResult(true)
}

function endWithSave(saved: boolean) {
  startPilot({
    mode: 'teach',
    topic: 'color',
    title: 'Teaching: Colour and tone',
    stepBudget: 25,
    allowed: ['flame.'],
    qualityRankAtStart: 1,
  })
  endPilot('stopped', {
    title: 'Warm tones',
    sessionName: 'Lesson: Colour and tone',
    session: take,
  })
  notePilotSaveResult(saved)
}

function replayButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Replay' })
}

describe('PilotOverlay end card', () => {
  afterEach(() => {
    cleanup()
    resetPilot()
  })

  it('keeps Replay available after a failed save', () => {
    endWithSave(false)
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)

    // The take never left memory, so replaying it is still the right offer.
    expect(replayButton().disabled).toBe(false)
    // ...but the card must not pretend the library has it.
    expect(
      screen.getByText(
        'Could not save "Lesson: Colour and tone" to your library',
      ),
    ).toBeTruthy()
  })

  it('plays a Cinema take from the top once the card is dismissed', () => {
    endCinema()
    const ctx = createMockCommandContext()
    ctx.timeline.tracks = () =>
      [
        {
          parameterPath: 'camera.zoom',
          keyframes: [
            { frame: 0, value: 1, easing: 'linear', interp: 'linear' },
          ],
        },
      ] as unknown as ReturnType<typeof ctx.timeline.tracks>
    render(() => <PilotOverlay ctx={ctx} />)

    screen.getByRole('button', { name: 'Play the animation' }).click()

    // Looping stays off — the viewer gets one pass, not a take that runs
    // until they find the transport.
    expect(ctx.timeline.setLoop).toHaveBeenCalledWith(false)
    expect(ctx.timeline.setCurrentFrame).toHaveBeenCalledWith(0)
    expect(ctx.timeline.play).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not offer playback for a Teach take', () => {
    endWithSave(true)
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    expect(
      screen.queryByRole('button', { name: 'Play the animation' }),
    ).toBeNull()
  })

  it('offers Replay and the saved line after a successful save', () => {
    endWithSave(true)
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)

    expect(replayButton().disabled).toBe(false)
    expect(
      screen.getByText('Saved to your library as "Lesson: Colour and tone"'),
    ).toBeTruthy()
  })
  it('renders no full-screen shield for a seat-scoped lock', () => {
    startPilot({
      mode: 'duel',
      title: 'Duel',
      stepBudget: 60,
      allowed: ['flame.'],
      qualityRankAtStart: 1,
      seatId: 'rival',
      lock: 'seat',
    })
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    expect(
      screen.queryByRole('dialog', { name: 'AI is driving the editor' }),
    ).toBeNull()
  })

  it('leaves Escape alone under a seat-scoped lock', () => {
    startPilot({
      mode: 'duel',
      title: 'Duel',
      stepBudget: 60,
      allowed: ['flame.'],
      qualityRankAtStart: 1,
      seatId: 'rival',
      lock: 'seat',
    })
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    let reachedTheApp = false
    const listener = () => {
      reachedTheApp = true
    }
    document.addEventListener('keydown', listener)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    // With no shield drawn there is nothing on screen to explain a swallowed
    // Escape, and two of them within 1500 ms used to end the take silently.
    expect(reachedTheApp).toBe(true)
    document.removeEventListener('keydown', listener)
  })

  it('claims Escape while the AI owns the screen', () => {
    startPilot({
      mode: 'teach',
      title: 'Teaching',
      stepBudget: 25,
      allowed: ['flame.'],
      qualityRankAtStart: 1,
    })
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    let reachedTheApp = false
    const listener = () => {
      reachedTheApp = true
    }
    document.addEventListener('keydown', listener)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(reachedTheApp).toBe(false)
    expect(screen.getByRole('button', { name: /Stop/ }).textContent).toContain(
      'Press Esc again',
    )
    document.removeEventListener('keydown', listener)
  })
})

/**
 * The ring belongs to the lock, not to the app: it exists exactly as long as
 * the AI holds the controls. One left behind on the end card would point at a
 * control the viewer can now touch.
 */
describe('PilotOverlay live spotlight', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      setTimeout(() => {
        cb(globalThis.performance.now())
      }, 16),
    )
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      clearTimeout(id)
    })
    const control = document.createElement('div')
    control.setAttribute('data-parameter-path', 'gamma')
    control.getBoundingClientRect = () => ({
      x: 40,
      y: 60,
      width: 200,
      height: 24,
      left: 40,
      top: 60,
      right: 240,
      bottom: 84,
      toJSON: () => ({}),
    })
    document.body.append(control)
  })

  afterEach(() => {
    cleanup()
    resetPilot()
    clearPilotFocus()
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function step(focus: string): RecordedAction {
    return { t: 0, id: 'pilot.test', args: [], focus }
  }

  function ring(): HTMLElement | null {
    return document.querySelector('[aria-hidden="true"][style*="left"]')
  }

  function startTeach() {
    startPilot({
      mode: 'teach',
      topic: 'color',
      title: 'Teaching: Colour and tone',
      stepBudget: 25,
      allowed: ['flame.'],
      qualityRankAtStart: 1,
    })
  }

  it('rings the control a step moved while the AI drives', () => {
    startTeach()
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)

    notePilotFocus(step('param:gamma'), 'Gamma: 2.4')
    vi.advanceTimersByTime(200)

    expect(ring()?.style.left).toBe('40px')
  })

  it('takes the ring down with the lock', () => {
    startTeach()
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)
    notePilotFocus(step('param:gamma'), 'Gamma: 2.4')
    vi.advanceTimersByTime(200)
    expect(ring()).not.toBeNull()

    endPilot('stopped', {
      title: 'Warm tones',
      sessionName: 'Lesson: Colour and tone',
      session: take,
    })

    expect(ring()).toBeNull()
  })
})
