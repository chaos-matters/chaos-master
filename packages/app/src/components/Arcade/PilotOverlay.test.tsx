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

  it('offers Replay and the saved line after a successful save', () => {
    endWithSave(true)
    render(() => <PilotOverlay ctx={createMockCommandContext()} />)

    expect(replayButton().disabled).toBe(false)
    expect(
      screen.getByText('Saved to your library as "Lesson: Colour and tone"'),
    ).toBeTruthy()
  })
})
