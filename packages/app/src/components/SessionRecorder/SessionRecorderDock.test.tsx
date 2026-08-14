import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastHost } from '@/components/Toast/Toast'
import { ToastProvider } from '@/contexts/ToastContext'
import { examples } from '@/flame/examples'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { recorderSavePending, recorderVisible, setRecorderCollapsed, setRecorderOffset, setRecorderSavePending, setRecorderVisible, } from './recorderUi'
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
    setRecorderOffset(null)
  })

  afterEach(() => {
    cancelSessionRecording()
    storeSessionMock.mockReset()
    vi.restoreAllMocks()
    setRecorderSavePending(false)
    setRecorderVisible(true)
    setRecorderCollapsed(false)
    setRecorderOffset(null)
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
})
