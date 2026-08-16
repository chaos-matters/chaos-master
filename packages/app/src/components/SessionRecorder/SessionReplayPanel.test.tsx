import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { cancelSessionRecording } from '@/recorder/recorder'
import { SESSION_FORMAT_VERSION } from '@/recorder/schema'
import { deepClone } from '@/utils/clone'
import { setFollowCamEnabled } from './recorderUi'
import { SessionReplayPanel } from './SessionReplayPanel'
import type { ReplayTarget } from '@/recorder/replay'
import type { RecordedSession } from '@/recorder/schema'

function makeSession(): RecordedSession {
  return {
    version: SESSION_FORMAT_VERSION,
    app: { version: 'test', flameSchemaVersion: '1.0' },
    createdAt: new Date(0).toISOString(),
    initial: deepClone(examples.example1),
    actions: [
      {
        t: 0,
        id: 'test.first',
        args: [],
        label: 'First change',
        note: 'Shape the first transform',
      },
      {
        t: 100,
        id: 'test.second',
        args: [],
        label: 'Second change',
      },
    ],
    unnamedWriteCount: 0,
  }
}

function makeTarget(): ReplayTarget {
  return {
    loadInitial: () => {},
    execute: () => true,
  }
}

describe('SessionReplayPanel accessibility', () => {
  beforeEach(() => {
    cancelSessionRecording()
    setFollowCamEnabled(false)
  })

  afterEach(() => {
    cancelSessionRecording()
    setFollowCamEnabled(true)
  })

  it('announces transport progress and exposes the current step', () => {
    const { unmount } = render(() => (
      <SessionReplayPanel
        session={makeSession()}
        target={makeTarget()}
        onClose={() => {}}
      />
    ))

    const status = screen.getByRole('status')
    const firstStep = screen.getByRole('button', {
      name: /1\s+Shape the first transform/,
    })

    expect(status.textContent).toBe('Replay ready. 2 steps.')
    expect(firstStep.getAttribute('aria-current')).toBeNull()
    expect(
      screen.getByRole('combobox', { name: 'Playback speed' }),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Next step' }))

    expect(status.textContent).toBe('Step 1 of 2: Shape the first transform.')
    expect(firstStep.getAttribute('aria-current')).toBe('step')
    unmount()
  })

  it('connects the caption disclosure and focuses its explicit input label', async () => {
    const { unmount } = render(() => (
      <SessionReplayPanel
        session={makeSession()}
        target={makeTarget()}
        onClose={() => {}}
      />
    ))

    fireEvent.click(screen.getByRole('button', { name: 'Next step' }))
    const status = screen.getByRole('status')
    const edit = screen.getByRole('button', {
      name: 'Edit caption for step 1',
    })
    const editorId = edit.getAttribute('aria-controls')

    expect(edit.getAttribute('aria-expanded')).toBe('false')
    expect(editorId).toBeTruthy()
    expect(document.getElementById(editorId!)).toBeNull()

    fireEvent.click(edit)

    const caption = screen.getByRole('textbox', {
      name: 'Caption for step 1',
    })
    await waitFor(() => {
      expect(document.activeElement).toBe(caption)
    })
    expect(edit.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(editorId!)).toBe(
      screen.getByRole('group', { name: 'Step 1 caption settings' }),
    )

    fireEvent.input(caption, { target: { value: 'A quieter opening' } })

    // Caption typing must not turn the live region into a keystroke echo.
    expect(status.textContent).toBe('Step 1 of 2: Shape the first transform.')
    expect(
      screen.getByRole('button', { name: 'Close editor for step 1' }),
    ).toBe(edit)
    unmount()
  })
})
