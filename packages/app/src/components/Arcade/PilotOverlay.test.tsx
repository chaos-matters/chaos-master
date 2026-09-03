import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it } from 'vitest'
import { endPilot, notePilotSaveResult, resetPilot, startPilot, } from '@/arcade/pilot'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { PilotOverlay } from './PilotOverlay'
import type { RecordedSession } from '@/recorder/schema'

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
})
