import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { createSignal, Suspense } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastHost } from '@/components/Toast/Toast'
import { ToastProvider } from '@/contexts/ToastContext'
import { examples } from '@/flame/examples'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { recorderOffset, recorderSavePending, recorderVisible, setFollowCamEnabled, setRecorderCollapsed, setRecorderExportPending, setRecorderFadeOnPlayback, setRecorderOffset, setRecorderOpacity, setRecorderSavePending, setRecorderVisible, } from './recorderUi'
import { calculateFloatingPanelPlacement, SessionRecorderDock, } from './SessionRecorderDock'
import type { ReplayTarget } from '@/recorder/replay'
import type { RecordedSession } from '@/recorder/schema'

const {
  deleteStoredSessionMock,
  loadStoredSessionsMock,
  renameStoredSessionMock,
  storeSessionMock,
} = vi.hoisted(() => ({
  deleteStoredSessionMock: vi.fn().mockResolvedValue([]),
  loadStoredSessionsMock: vi.fn().mockResolvedValue([]),
  renameStoredSessionMock: vi.fn().mockResolvedValue([]),
  storeSessionMock: vi.fn(),
}))

vi.mock('@/utils/sessionsDB', () => ({
  deleteStoredSession: deleteStoredSessionMock,
  loadStoredSessions: loadStoredSessionsMock,
  renameStoredSession: renameStoredSessionMock,
  storeSession: storeSessionMock,
}))

const target: ReplayTarget = {
  loadInitial: () => {},
  execute: () => true,
}

describe('SessionRecorderDock caption persistence', () => {
  beforeEach(() => {
    cancelSessionRecording()
    deleteStoredSessionMock.mockReset().mockResolvedValue([])
    loadStoredSessionsMock.mockReset().mockResolvedValue([])
    renameStoredSessionMock.mockReset().mockResolvedValue([])
    setRecorderExportPending(false)
    setRecorderSavePending(false)
    setRecorderVisible(true)
    setRecorderCollapsed(false)
    setRecorderFadeOnPlayback(true)
    setRecorderOffset(null)
    setRecorderOpacity(1)
    setFollowCamEnabled(true)
  })

  afterEach(() => {
    cancelSessionRecording()
    deleteStoredSessionMock.mockReset()
    storeSessionMock.mockReset()
    loadStoredSessionsMock.mockReset()
    renameStoredSessionMock.mockReset()
    setRecorderExportPending(false)
    setRecorderSavePending(false)
    setRecorderVisible(true)
    setRecorderCollapsed(false)
    setRecorderFadeOnPlayback(true)
    setRecorderOffset(null)
    setRecorderOpacity(1)
    setFollowCamEnabled(true)
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('reports a failed caption save without losing the original take', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const saveError = new Error('quota exceeded')
    let rejectSave: ((reason?: unknown) => void) | undefined
    storeSessionMock.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject
        }),
    )
    startSessionRecording(examples.example1)
    const session = stopSessionRecording()
    if (!session) throw new Error('expected a recorded session')

    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={target}
          session={session}
          onSessionChange={() => {}}
          busy={false}
        />
        <ToastHost />
      </ToastProvider>
    ))

    const saveButton = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Save captions',
    })
    const closeButton = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Close',
    })
    const hideButton = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Hide recorder',
    })

    fireEvent.click(saveButton)

    expect(storeSessionMock).toHaveBeenCalledTimes(1)
    expect(saveButton.disabled).toBe(true)
    expect(closeButton.disabled).toBe(true)
    expect(hideButton.disabled).toBe(true)
    expect(recorderSavePending()).toBe(true)
    setRecorderVisible(false)
    expect(recorderVisible()).toBe(true)
    fireEvent.click(saveButton)
    expect(storeSessionMock).toHaveBeenCalledTimes(1)

    rejectSave?.(saveError)

    await waitFor(() => {
      expect(
        screen.getByText(
          'Could not save captions locally — your caption edits are still open',
        ),
      ).toBeTruthy()
      expect(saveButton.disabled).toBe(false)
      expect(closeButton.disabled).toBe(false)
      expect(hideButton.disabled).toBe(false)
      expect(recorderSavePending()).toBe(false)
    })
    expect(warn).toHaveBeenCalledWith(
      '[recorder] could not save captioned session',
      saveError,
    )

    unmount()
  })

  it('recedes while a timed replay advances and returns when paused', async () => {
    startSessionRecording(examples.example1)
    const recorded = stopSessionRecording()
    if (!recorded) throw new Error('expected a recorded session')
    const session = {
      ...recorded,
      actions: [
        {
          t: 1_000,
          id: 'flame.setGamma',
          args: [2.4],
          label: 'Set gamma',
        },
      ],
    }

    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={target}
          session={session}
          onSessionChange={() => {}}
          busy={false}
        />
      </ToastProvider>
    ))

    const dock = document.querySelector<HTMLElement>(
      '[data-replay-region="transport"]',
    )
    expect(dock?.style.getPropertyValue('--recorder-opacity')).toBe('1')

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Play' }),
    )
    await waitFor(() => {
      expect(dock?.style.getPropertyValue('--recorder-opacity')).toBe('0.25')
    })

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Pause' }),
    )
    await waitFor(() => {
      expect(dock?.style.getPropertyValue('--recorder-opacity')).toBe('1')
    })

    unmount()
  })

  it('keeps the workspace mounted while recordings load and reuses the loaded library', async () => {
    let resolveSessions: ((value: []) => void) | undefined
    loadStoredSessionsMock.mockImplementationOnce(
      () =>
        new Promise<[]>((resolve) => {
          resolveSessions = resolve
        }),
    )

    const { unmount } = render(() => (
      <Suspense fallback={<span>Workspace suspended</span>}>
        <div data-testid="workspace">
          <ToastProvider>
            <SessionRecorderDock
              flameDescriptor={examples.example1}
              target={target}
              session={undefined}
              onSessionChange={() => {}}
              busy={false}
            />
          </ToastProvider>
        </div>
      </Suspense>
    ))

    const recordingsButton = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Recordings',
    })
    expect(recordingsButton.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(recordingsButton)

    expect(screen.getByTestId('workspace')).toBeTruthy()
    expect(screen.queryByText('Workspace suspended')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain(
      'Loading recordings',
    )
    expect(loadStoredSessionsMock).toHaveBeenCalledTimes(1)
    expect(recordingsButton.getAttribute('aria-expanded')).toBe('true')
    const library = screen.getByRole('region', { name: 'Recordings' })
    await waitFor(() => {
      expect(document.activeElement).toBe(library)
    })

    resolveSessions?.([])
    await waitFor(() => {
      expect(screen.getByText(/No saved recordings yet/)).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(recordingsButton.getAttribute('aria-expanded')).toBe('false')
    await waitFor(() => {
      expect(document.activeElement).toBe(recordingsButton)
    })
    fireEvent.click(recordingsButton)
    expect(loadStoredSessionsMock).toHaveBeenCalledTimes(1)

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Collapse recorder',
      }),
    )
    expect(library?.hidden).toBe(true)
    expect(recordingsButton.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(recordingsButton)
    expect(library?.hidden).toBe(false)
    expect(recordingsButton.getAttribute('aria-expanded')).toBe('true')
    await waitFor(() => {
      expect(document.activeElement).toBe(library)
    })

    unmount()
  })

  it('refreshes a retained library after an external recording import', async () => {
    const [libraryRevision, setLibraryRevision] = createSignal(0)
    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={target}
          session={undefined}
          onSessionChange={() => {}}
          libraryRevision={libraryRevision()}
          busy={false}
        />
      </ToastProvider>
    ))

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Recordings' }),
    )
    await waitFor(() => {
      expect(loadStoredSessionsMock).toHaveBeenCalledTimes(1)
    })

    setLibraryRevision(1)

    await waitFor(() => {
      expect(loadStoredSessionsMock).toHaveBeenCalledTimes(2)
    })
    unmount()
  })

  it('exposes transparency as a disclosure and preserves keyboard focus flow', async () => {
    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={target}
          session={undefined}
          onSessionChange={() => {}}
          busy={false}
        />
      </ToastProvider>
    ))

    const trigger = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Transparency',
    })
    const controlsId = trigger.getAttribute('aria-controls')
    const controls = document.getElementById(controlsId ?? '')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(controls?.hidden).toBe(true)

    fireEvent.click(trigger)

    const slider = screen.getByRole<HTMLInputElement>('slider', {
      name: 'Recorder opacity',
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(controls?.hidden).toBe(false)
    await waitFor(() => {
      expect(document.activeElement).toBe(slider)
    })

    fireEvent.keyDown(slider, { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(controls?.hidden).toBe(true)
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })

    unmount()
  })

  it('recovers a failed library read with an explicit retry', async () => {
    let resolveRetry: ((value: []) => void) | undefined
    loadStoredSessionsMock
      .mockRejectedValueOnce(new Error('indexeddb unavailable'))
      .mockImplementationOnce(
        () =>
          new Promise<[]>((resolve) => {
            resolveRetry = resolve
          }),
      )

    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={target}
          session={undefined}
          onSessionChange={() => {}}
          busy={false}
        />
      </ToastProvider>
    ))

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Recordings' }),
    )
    const retry = await screen.findByRole<HTMLButtonElement>('button', {
      name: 'Retry',
    })
    retry.focus()
    fireEvent.click(retry)
    const retrying = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Retrying…',
    })
    expect(retrying).toBe(retry)
    expect(retrying.disabled).toBe(true)
    expect(document.activeElement).toBe(retry)

    resolveRetry?.([])

    await waitFor(() => {
      expect(screen.getByText(/No saved recordings yet/)).toBeTruthy()
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Close' }),
      )
    })
    expect(loadStoredSessionsMock).toHaveBeenCalledTimes(2)

    unmount()
  })

  it('names the rename field and returns focus when rename is cancelled', async () => {
    startSessionRecording(examples.example1)
    const recorded = stopSessionRecording()
    if (!recorded) throw new Error('expected a recorded session')
    loadStoredSessionsMock.mockResolvedValueOnce([
      {
        id: 7,
        name: 'Palette pass',
        timestamp: Date.now(),
        actionCount: recorded.actions.length,
        unnamedWriteCount: recorded.unnamedWriteCount,
        session: recorded,
      },
    ])

    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={target}
          session={undefined}
          onSessionChange={() => {}}
          busy={false}
        />
      </ToastProvider>
    ))

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Recordings' }),
    )
    fireEvent.click(
      await screen.findByRole<HTMLButtonElement>('button', {
        name: 'Rename recording Palette pass',
      }),
    )
    const input = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Rename recording Palette pass',
    })
    fireEvent.keyDown(input, { key: 'Escape' })

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Rename recording Palette pass' }),
      )
    })

    unmount()
  })

  it('restores rename focus after the stored list refreshes', async () => {
    startSessionRecording(examples.example1)
    const recorded = stopSessionRecording()
    if (!recorded) throw new Error('expected a recorded session')
    const original = {
      id: 9,
      name: 'Geometry pass',
      timestamp: Date.now(),
      actionCount: recorded.actions.length,
      unnamedWriteCount: recorded.unnamedWriteCount,
      session: recorded,
    }
    let resolveRename: ((value: (typeof original)[]) => void) | undefined
    loadStoredSessionsMock.mockResolvedValueOnce([original])
    renameStoredSessionMock.mockImplementationOnce(
      () =>
        new Promise<(typeof original)[]>((resolve) => {
          resolveRename = resolve
        }),
    )

    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={target}
          session={undefined}
          onSessionChange={() => {}}
          busy={false}
        />
      </ToastProvider>
    ))

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Recordings' }),
    )
    fireEvent.click(
      await screen.findByRole<HTMLButtonElement>('button', {
        name: `Rename recording ${original.name}`,
      }),
    )
    const input = screen.getByRole<HTMLInputElement>('textbox', {
      name: `Rename recording ${original.name}`,
    })
    input.focus()
    fireEvent.input(input, { target: { value: 'Final geometry' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(renameStoredSessionMock).toHaveBeenCalledWith(9, 'Final geometry')
    expect(document.activeElement).toBe(input)
    expect(input.readOnly).toBe(true)

    resolveRename?.([{ ...original, name: 'Final geometry' }])
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', {
          name: 'Rename recording Final geometry',
        }),
      )
    })

    unmount()
  })

  it('keeps a failed rename editable and announces the persistence failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    startSessionRecording(examples.example1)
    const recorded = stopSessionRecording()
    if (!recorded) throw new Error('expected a recorded session')
    const original = {
      id: 10,
      name: 'Color pass',
      timestamp: Date.now(),
      actionCount: recorded.actions.length,
      unnamedWriteCount: recorded.unnamedWriteCount,
      session: recorded,
    }
    loadStoredSessionsMock.mockResolvedValueOnce([original])
    const renameError = new Error('indexeddb write failed')
    renameStoredSessionMock.mockRejectedValueOnce(renameError)

    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={target}
          session={undefined}
          onSessionChange={() => {}}
          busy={false}
        />
        <ToastHost />
      </ToastProvider>
    ))

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Recordings' }),
    )
    fireEvent.click(
      await screen.findByRole<HTMLButtonElement>('button', {
        name: `Rename recording ${original.name}`,
      }),
    )
    const input = screen.getByRole<HTMLInputElement>('textbox', {
      name: `Rename recording ${original.name}`,
    })
    fireEvent.input(input, { target: { value: 'Final colors' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(
        screen.getByText(
          `Could not rename "${original.name}" — your edit is still open`,
        ),
      ).toBeTruthy()
      expect(document.activeElement).toBe(input)
      expect(input.readOnly).toBe(false)
      expect(input.value).toBe('Final colors')
    })
    expect(warn).toHaveBeenCalledWith(
      '[recorder] could not rename recording',
      renameError,
    )

    unmount()
  })

  it('announces a failed delete and returns focus to the retained action', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    startSessionRecording(examples.example1)
    const recorded = stopSessionRecording()
    if (!recorded) throw new Error('expected a recorded session')
    const original = {
      id: 12,
      name: 'Keep this take',
      timestamp: Date.now(),
      actionCount: recorded.actions.length,
      unnamedWriteCount: recorded.unnamedWriteCount,
      session: recorded,
    }
    loadStoredSessionsMock.mockResolvedValueOnce([original])
    const deleteError = new Error('indexeddb delete failed')
    deleteStoredSessionMock.mockRejectedValueOnce(deleteError)

    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={target}
          session={undefined}
          onSessionChange={() => {}}
          busy={false}
        />
        <ToastHost />
      </ToastProvider>
    ))

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Recordings' }),
    )
    const deleteButton = await screen.findByRole<HTMLButtonElement>('button', {
      name: `Delete recording ${original.name}`,
    })
    deleteButton.focus()
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(
        screen.getByText(
          `Could not delete "${original.name}" — it is still in Recordings`,
        ),
      ).toBeTruthy()
      expect(document.activeElement).toBe(deleteButton)
      expect(deleteButton.disabled).toBe(false)
    })
    expect(warn).toHaveBeenCalledWith(
      '[recorder] could not delete recording',
      deleteError,
    )

    unmount()
  })

  it('moves focus to the next recording after a keyboard delete', async () => {
    startSessionRecording(examples.example1)
    const recorded = stopSessionRecording()
    if (!recorded) throw new Error('expected a recorded session')
    const first = {
      id: 13,
      name: 'First take',
      timestamp: Date.now(),
      actionCount: recorded.actions.length,
      unnamedWriteCount: recorded.unnamedWriteCount,
      session: recorded,
    }
    const second = { ...first, id: 14, name: 'Second take' }
    loadStoredSessionsMock.mockResolvedValueOnce([first, second])
    deleteStoredSessionMock.mockResolvedValueOnce([second])

    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={target}
          session={undefined}
          onSessionChange={() => {}}
          busy={false}
        />
      </ToastProvider>
    ))

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Recordings' }),
    )
    const firstDelete = await screen.findByRole<HTMLButtonElement>('button', {
      name: `Delete recording ${first.name}`,
    })
    firstDelete.focus()
    fireEvent.click(firstDelete)

    await waitFor(() => {
      expect(
        screen.queryByRole('button', {
          name: `Delete recording ${first.name}`,
        }),
      ).toBeNull()
      expect(document.activeElement).toBe(
        screen.getByRole('button', {
          name: `Delete recording ${second.name}`,
        }),
      )
    })

    unmount()
  })

  it('does not steal focus when a slow delete settles after the user moves on', async () => {
    startSessionRecording(examples.example1)
    const recorded = stopSessionRecording()
    if (!recorded) throw new Error('expected a recorded session')
    const first = {
      id: 15,
      name: 'Slow delete',
      timestamp: Date.now(),
      actionCount: recorded.actions.length,
      unnamedWriteCount: recorded.unnamedWriteCount,
      session: recorded,
    }
    const second = { ...first, id: 16, name: 'Keep focus here' }
    loadStoredSessionsMock.mockResolvedValueOnce([first, second])
    let resolveDelete: ((sessions: (typeof second)[]) => void) | undefined
    deleteStoredSessionMock.mockImplementationOnce(
      () =>
        new Promise<(typeof second)[]>((resolve) => {
          resolveDelete = resolve
        }),
    )

    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={target}
          session={undefined}
          onSessionChange={() => {}}
          busy={false}
        />
      </ToastProvider>
    ))

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Recordings' }),
    )
    const firstDelete = await screen.findByRole<HTMLButtonElement>('button', {
      name: `Delete recording ${first.name}`,
    })
    firstDelete.focus()
    fireEvent.click(firstDelete)

    const secondDownload = screen.getByRole<HTMLButtonElement>('button', {
      name: `Download recording ${second.name}`,
    })
    secondDownload.focus()
    expect(document.activeElement).toBe(secondDownload)

    resolveDelete?.([second])
    await waitFor(() => {
      expect(
        screen.queryByRole('button', {
          name: `Delete recording ${first.name}`,
        }),
      ).toBeNull()
      expect(document.activeElement).toBe(secondDownload)
    })

    unmount()
  })

  it('moves focus from a library replay action to replay transport', async () => {
    startSessionRecording(examples.example1)
    const recorded = stopSessionRecording()
    if (!recorded) throw new Error('expected a recorded session')
    const replaySession = {
      ...recorded,
      actions: [
        {
          t: 0,
          id: 'flame.setGamma',
          args: [2.4],
          label: 'Set gamma',
        },
      ],
    }
    loadStoredSessionsMock.mockResolvedValueOnce([
      {
        id: 11,
        name: 'Replay focus',
        timestamp: Date.now(),
        actionCount: replaySession.actions.length,
        unnamedWriteCount: recorded.unnamedWriteCount,
        session: replaySession,
      },
    ])
    const [session, setSession] = createSignal<RecordedSession>()

    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={target}
          session={session()}
          onSessionChange={setSession}
          busy={false}
        />
      </ToastProvider>
    ))

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Recordings' }),
    )
    fireEvent.click(
      await screen.findByRole<HTMLButtonElement>('button', {
        name: 'Replay recording Replay focus',
      }),
    )

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Play' }),
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Recordings' }),
      )
    })

    unmount()
  })

  it('places floating panels on the visible side of a top-right bar', () => {
    expect(
      calculateFloatingPanelPlacement({
        bar: { top: 8, right: 312, bottom: 52, left: 280 },
        panelWidth: 300,
        panelHeight: 160,
        viewportWidth: 320,
        viewportHeight: 480,
      }),
    ).toEqual({ below: true, maxHeight: 420, offsetX: -268 })

    expect(
      calculateFloatingPanelPlacement({
        bar: { top: 420, right: 312, bottom: 464, left: 280 },
        panelWidth: 300,
        panelHeight: 160,
        viewportWidth: 320,
        viewportHeight: 480,
      }),
    ).toEqual({ below: false, maxHeight: 412, offsetX: -268 })
  })

  it('clamps the complete floating recorder bar inside the viewport', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(320)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(200)
    setRecorderOffset({ x: 900, y: 700 })

    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={target}
          session={undefined}
          onSessionChange={() => {}}
          busy={false}
        />
      </ToastProvider>
    ))

    const grip = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Move the recorder',
    })
    const bar = grip.parentElement
    if (!(bar instanceof HTMLDivElement))
      throw new Error('missing recorder bar')
    Object.defineProperties(bar, {
      offsetWidth: { configurable: true, value: 300 },
      offsetHeight: { configurable: true, value: 44 },
    })

    window.dispatchEvent(new Event('resize'))

    expect(recorderOffset()).toEqual({ x: 12, y: 148 })
    expect(bar.parentElement?.style.left).toBe('12px')
    expect(bar.parentElement?.style.top).toBe('148px')

    fireEvent.keyDown(grip, { key: 'Home' })
    expect(recorderOffset()).toBeNull()

    unmount()
  })

  it('ignores unrelated pointers during a recorder drag', () => {
    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={target}
          session={undefined}
          onSessionChange={() => {}}
          busy={false}
        />
      </ToastProvider>
    ))
    const grip = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Move the recorder',
    })
    const bar = grip.parentElement
    if (!(bar instanceof HTMLDivElement))
      throw new Error('missing recorder bar')
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      right: 300,
      bottom: 144,
      left: 100,
      width: 200,
      height: 44,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    })
    Object.defineProperties(grip, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: {
        configurable: true,
        value: vi.fn().mockReturnValue(false),
      },
    })

    fireEvent.pointerDown(grip, {
      pointerId: 7,
      pointerType: 'touch',
      clientX: 110,
      clientY: 110,
    })
    fireEvent.pointerMove(window, {
      pointerId: 8,
      clientX: 260,
      clientY: 180,
    })
    fireEvent.pointerUp(window, { pointerId: 8 })
    expect(recorderOffset()).toBeNull()

    fireEvent.pointerMove(window, {
      pointerId: 7,
      clientX: 150,
      clientY: 150,
    })
    expect(recorderOffset()).not.toBeNull()
    fireEvent.pointerUp(window, { pointerId: 7 })

    unmount()
  })

  it('reports whether the active replay step owns the timeline surface', async () => {
    vi.useFakeTimers()
    startSessionRecording(examples.example1)
    const recorded = stopSessionRecording()
    if (!recorded) throw new Error('expected a recorded session')
    const onPresentationChange = vi.fn()
    const session = {
      ...recorded,
      actions: [
        {
          t: 0,
          id: 'timeline.setFps',
          args: [30],
          label: 'Set timeline FPS',
        },
      ],
    }

    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={target}
          session={session}
          onSessionChange={() => {}}
          onReplayPresentationChange={onPresentationChange}
          busy={false}
        />
      </ToastProvider>
    ))

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Play' }),
    )
    vi.advanceTimersByTime(0)
    await Promise.resolve()

    expect(onPresentationChange).toHaveBeenCalledWith({
      playing: true,
      timelineTargeted: true,
    })

    unmount()
  })

  it('disables recording while an animation export owns the document', () => {
    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={target}
          session={undefined}
          onSessionChange={() => {}}
          busy={true}
          replayBlocked={true}
        />
      </ToastProvider>
    ))

    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Record steps' })
        .disabled,
    ).toBe(true)

    unmount()
  })

  it('disables every replay navigation control while animation export owns the document', () => {
    startSessionRecording(examples.example1)
    const recorded = stopSessionRecording()
    if (!recorded) throw new Error('expected a recorded session')
    const session = {
      ...recorded,
      actions: [
        {
          t: 0,
          id: 'flame.setGamma',
          args: [2.4],
          label: 'First gamma',
        },
        {
          t: 100,
          id: 'flame.setGamma',
          args: [2.8],
          label: 'Second gamma',
        },
      ],
    }

    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={target}
          session={session}
          onSessionChange={() => {}}
          busy={true}
          replayBlocked={true}
        />
      </ToastProvider>
    ))

    for (const name of [
      'Back to the starting flame',
      'Previous step',
      'Play',
      'Next step',
      '1 First gamma',
      '2 Second gamma',
    ]) {
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name }).disabled,
      ).toBe(true)
    }

    unmount()
  })

  it('pauses and commits a timed replay when animation export takes ownership', async () => {
    vi.useFakeTimers()
    setFollowCamEnabled(false)
    startSessionRecording(examples.example1)
    const recorded = stopSessionRecording()
    if (!recorded) throw new Error('expected a recorded session')
    const session = {
      ...recorded,
      actions: [
        {
          t: 0,
          id: 'flame.setGamma',
          args: [2.4],
          label: 'First gamma',
        },
        {
          t: 100,
          id: 'flame.setGamma',
          args: [2.8],
          label: 'Second gamma',
        },
      ],
    }
    const [blocked, setBlocked] = createSignal(false)
    const execute = vi.fn(() => true)
    const beginBatch = vi.fn()
    const endBatch = vi.fn()

    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={{
            loadInitial: () => {},
            execute,
            beginBatch,
            endBatch,
          }}
          session={session}
          onSessionChange={() => {}}
          busy={blocked()}
          replayBlocked={blocked()}
        />
      </ToastProvider>
    ))

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Play' }),
    )
    vi.advanceTimersByTime(0)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenLastCalledWith('flame.setGamma', [2.4])
    expect(beginBatch).toHaveBeenCalledTimes(1)
    expect(endBatch).not.toHaveBeenCalled()

    setBlocked(true)
    await Promise.resolve()

    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Play' }).disabled,
    ).toBe(true)
    expect(endBatch).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(10_000)
    expect(execute).toHaveBeenCalledTimes(1)

    unmount()
  })

  it('leaves editor presentation untouched when follow-cam is disabled', () => {
    startSessionRecording(examples.example1)
    const recorded = stopSessionRecording()
    if (!recorded) throw new Error('expected a recorded session')
    const session = {
      ...recorded,
      actions: [
        {
          t: 0,
          id: 'flame.setGamma',
          args: [2.4],
          label: 'Set gamma',
        },
      ],
    }
    const prepare = vi.fn()
    setFollowCamEnabled(false)

    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderDock
          flameDescriptor={examples.example1}
          target={target}
          session={session}
          onSessionChange={() => {}}
          onPrepareAction={prepare}
          busy={false}
        />
      </ToastProvider>
    ))

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Next step' }),
    )
    expect(prepare).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Enable replay follow-cam',
      }),
    )
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(prepare).toHaveBeenLastCalledWith(
      expect.objectContaining({ spotlightFocus: 'param:gamma' }),
    )
    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Back to the starting flame',
      }),
    )
    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Next step' }),
    )
    expect(prepare).toHaveBeenCalledTimes(2)

    unmount()
  })
})
