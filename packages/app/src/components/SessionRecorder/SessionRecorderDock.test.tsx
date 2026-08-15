import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastHost } from '@/components/Toast/Toast'
import { ToastProvider } from '@/contexts/ToastContext'
import { examples } from '@/flame/examples'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { recorderSavePending, recorderVisible, setFollowCamEnabled, setRecorderCollapsed, setRecorderFadeOnPlayback, setRecorderOffset, setRecorderOpacity, setRecorderSavePending, setRecorderVisible, } from './recorderUi'
import { SessionRecorderDock } from './SessionRecorderDock'
import type { ReplayTarget } from '@/recorder/replay'

const { storeSessionMock } = vi.hoisted(() => ({
  storeSessionMock: vi.fn(),
}))

vi.mock('@/utils/sessionsDB', () => ({
  deleteStoredSession: vi.fn().mockResolvedValue([]),
  loadStoredSessions: vi.fn().mockResolvedValue([]),
  renameStoredSession: vi.fn().mockResolvedValue([]),
  storeSession: storeSessionMock,
}))

const target: ReplayTarget = {
  loadInitial: () => {},
  execute: () => true,
}

describe('SessionRecorderDock caption persistence', () => {
  beforeEach(() => {
    cancelSessionRecording()
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
    storeSessionMock.mockReset()
    vi.restoreAllMocks()
    vi.useRealTimers()
    setRecorderSavePending(false)
    setRecorderVisible(true)
    setRecorderCollapsed(false)
    setRecorderFadeOnPlayback(true)
    setRecorderOffset(null)
    setRecorderOpacity(1)
    setFollowCamEnabled(true)
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
