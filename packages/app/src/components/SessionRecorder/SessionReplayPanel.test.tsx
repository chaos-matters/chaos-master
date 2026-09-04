import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { cancelSessionRecording } from '@/recorder/recorder'
import { SESSION_FORMAT_VERSION } from '@/recorder/schema'
import { deepClone } from '@/utils/clone'
import { setFollowCamEnabled } from './recorderUi'
import { SessionReplayPanel } from './SessionReplayPanel'
import type { ReplayTarget } from '@/recorder/replay'
import type { ReplayVideoExportRequest } from '@/recorder/replayInterfaceVideo'
import type { RecordedSession } from '@/recorder/schema'

vi.mock('@/recorder/replayInterfaceVideo', () => ({
  replayInterfaceCaptureSupported: () => true,
}))

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

  // The list is a scroll container, and on a lesson longer than the panel the
  // active step used to walk below the fold while the flame kept changing —
  // conspicuous in a full-interface recording next to a timeline that moves.
  it('scrolls the step it is playing into view', () => {
    const spy = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {})
    try {
      const { unmount } = render(() => (
        <SessionReplayPanel
          session={makeSession()}
          target={makeTarget()}
          onClose={() => {}}
        />
      ))
      fireEvent.click(screen.getByRole('button', { name: /Next step/i }))

      // `mock.instances` is the receiver of each call, so this asks which
      // element was scrolled rather than trusting that only one was.
      const index = spy.mock.instances.findIndex(
        (element) =>
          element instanceof Element &&
          element.getAttribute('aria-current') === 'step',
      )
      expect(index).toBeGreaterThanOrEqual(0)
      // 'nearest' so a viewer reading further down the list is not yanked back
      // on a step that was already visible.
      expect(spy.mock.calls[index]?.[0]).toMatchObject({ block: 'nearest' })
      unmount()
    } finally {
      spy.mockRestore()
    }
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

  it('exports the edited take at the selected replay speed without mutating the source', async () => {
    const source = makeSession()
    const exportVideo = vi.fn().mockResolvedValue(undefined)
    const { unmount } = render(() => (
      <SessionReplayPanel
        session={source}
        target={makeTarget()}
        onExportVideo={exportVideo}
        onClose={() => {}}
      />
    ))

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit caption for step 1' }),
    )
    fireEvent.input(
      screen.getByRole('textbox', { name: 'Caption for step 1' }),
      { target: { value: 'Reveal the first transform' } },
    )
    fireEvent.input(screen.getByRole('spinbutton', { name: /hold/i }), {
      target: { value: '900' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Playback speed' }), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Export artwork' }))

    await waitFor(() => {
      expect(exportVideo).toHaveBeenCalledTimes(1)
    })
    const [request] = exportVideo.mock.calls[0] as [ReplayVideoExportRequest]
    expect(request.mode).toBe('artwork')
    expect(request.session.actions[0]?.note).toBe('Reveal the first transform')
    expect(request.session.actions[0]?.holdMs).toBe(900)
    expect(request.playbackSpeed).toBe(2)
    expect(source.actions[0]?.note).toBe('Shape the first transform')
    expect(source.actions[0]?.holdMs).toBeUndefined()
    unmount()
  })

  it('starts full-interface capture directly from the export click', () => {
    const exportVideo = vi.fn().mockResolvedValue(undefined)
    const { unmount } = render(() => (
      <SessionReplayPanel
        session={makeSession()}
        target={makeTarget()}
        onExportVideo={exportVideo}
        onClose={() => {}}
      />
    ))

    fireEvent.click(screen.getByRole('button', { name: 'Full interface' }))
    expect(screen.getByText(/Choose This Tab/)).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Record full interface' }),
    )

    // getDisplayMedia requires transient activation. The owner callback must
    // therefore run synchronously on this same trusted click, not after an
    // awaited validation or queued microtask.
    expect(exportVideo).toHaveBeenCalledTimes(1)
    const [request] = exportVideo.mock.calls[0] as [ReplayVideoExportRequest]
    expect(request.mode).toBe('interface')
    if (request.mode !== 'interface') {
      throw new Error('expected a full-interface export request')
    }
    expect(request.playbackSpeed).toBe(1)
    expect(request.prepareReplay).toEqual(expect.any(Function))
    expect(request.playReplay).toEqual(expect.any(Function))
    unmount()
  })

  it('disables publishing when the take has no trustworthy creation sequence', () => {
    const empty = makeSession()
    empty.actions = []
    const first = render(() => (
      <SessionReplayPanel
        session={empty}
        target={makeTarget()}
        onExportVideo={() => {}}
        onClose={() => {}}
      />
    ))

    const emptyExport = screen.getByRole('button', { name: 'Export artwork' })
    expect((emptyExport as HTMLButtonElement).disabled).toBe(true)
    expect(emptyExport.title).toMatch(/at least one authored step/)
    first.unmount()

    const incomplete = makeSession()
    incomplete.unnamedWriteCount = 1
    const second = render(() => (
      <SessionReplayPanel
        session={incomplete}
        target={makeTarget()}
        onExportVideo={() => {}}
        onClose={() => {}}
      />
    ))

    const incompleteExport = screen.getByRole('button', {
      name: 'Export artwork',
    })
    expect((incompleteExport as HTMLButtonElement).disabled).toBe(true)
    expect(incompleteExport.title).toMatch(/clean take/)
    second.unmount()
  })
})
