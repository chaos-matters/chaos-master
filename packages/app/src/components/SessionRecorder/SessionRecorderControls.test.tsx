import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastHost } from '@/components/Toast/Toast'
import { ToastProvider } from '@/contexts/ToastContext'
import { examples } from '@/flame/examples'
import { cancelSessionRecording, isSessionRecording } from '@/recorder/recorder'
import { serializeSession, SESSION_FORMAT_VERSION } from '@/recorder/schema'
import { deepClone } from '@/utils/clone'
import { SessionRecorderControls } from './SessionRecorderControls'
import type { RecordedSession } from '@/recorder/schema'

const { storeImportedSessionMock, storeSessionMock } = vi.hoisted(() => ({
  storeImportedSessionMock: vi.fn(),
  storeSessionMock: vi.fn(),
}))

vi.mock('@/utils/sessionsDB', () => ({
  storeImportedSession: storeImportedSessionMock,
  storeSession: storeSessionMock,
}))

function validSession(): RecordedSession {
  return {
    version: SESSION_FORMAT_VERSION,
    app: { version: 'test', flameSchemaVersion: 'test' },
    createdAt: '2026-08-21T12:00:00.000Z',
    initial: deepClone(examples.example1),
    actions: [{ t: 0, id: 'flame.setGamma', args: [2] }],
    unnamedWriteCount: 0,
  }
}

describe('SessionRecorderControls start feedback', () => {
  beforeEach(() => {
    storeImportedSessionMock.mockReset()
    storeSessionMock.mockReset()
  })

  afterEach(() => {
    cancelSessionRecording()
    vi.restoreAllMocks()
  })

  it('renders the idle actions as accessible icon buttons', () => {
    const onToggleLibrary = vi.fn()
    const { container, unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderControls
          flameDescriptor={examples.example1}
          onOpenSession={() => {}}
          onSessionStored={() => {}}
          onToggleLibrary={onToggleLibrary}
        />
      </ToastProvider>
    ))

    const record = screen.getByRole('button', { name: 'Record steps' })
    const recordings = screen.getByRole('button', { name: 'Recordings' })
    const open = screen.getByRole('button', { name: 'Open steps' })

    expect(record.textContent?.trim()).toBe('')
    expect(record.querySelector('svg')).toBeTruthy()
    expect(record.getAttribute('title')).toBe(
      'Record authored workspace changes as replayable steps',
    )
    expect(recordings.textContent?.trim()).toBe('')
    expect(recordings.querySelector('svg')).toBeTruthy()
    expect(open.textContent?.trim()).toBe('')
    expect(open.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('label')).toBeNull()

    fireEvent.click(recordings)
    expect(onToggleLibrary).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('opens the hidden file input from a real button', () => {
    const { container, unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderControls
          flameDescriptor={examples.example1}
          onOpenSession={() => {}}
          onSessionStored={() => {}}
          onToggleLibrary={() => {}}
        />
      </ToastProvider>
    ))
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).toBeTruthy()
    const click = vi.spyOn(input!, 'click').mockImplementation(() => {})

    fireEvent.click(screen.getByRole('button', { name: 'Open steps' }))

    expect(click).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('imports a selected steps file before opening its replay', async () => {
    const session = validSession()
    const file = new File(['session'], 'Imported take.steps.json', {
      type: 'application/json',
    })
    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve(serializeSession(session)),
    })
    storeImportedSessionMock.mockResolvedValue({
      added: true,
      name: 'Imported take',
    })
    const onOpenSession = vi.fn()
    const onSessionStored = vi.fn()
    const { container, unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderControls
          flameDescriptor={examples.example1}
          onOpenSession={onOpenSession}
          onSessionStored={onSessionStored}
          onToggleLibrary={() => {}}
        />
        <ToastHost />
      </ToastProvider>
    ))
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')

    fireEvent.change(input!, { target: { files: [file] } })

    await waitFor(() => {
      expect(storeImportedSessionMock).toHaveBeenCalledWith(session, file.name)
    })
    expect(onSessionStored).toHaveBeenCalledWith({ openLibrary: false })
    expect(onOpenSession).toHaveBeenCalledWith(session)
    expect(
      screen.getByText('Imported "Imported take" to Recordings'),
    ).toBeTruthy()
    unmount()
  })

  it('still opens a validated replay when local import storage fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storageError = new Error('quota exceeded')
    const session = validSession()
    const file = new File(['session'], 'Portable take.steps.json', {
      type: 'application/json',
    })
    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve(serializeSession(session)),
    })
    storeImportedSessionMock.mockRejectedValue(storageError)
    const onOpenSession = vi.fn()
    const onSessionStored = vi.fn()
    const { container, unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderControls
          flameDescriptor={examples.example1}
          onOpenSession={onOpenSession}
          onSessionStored={onSessionStored}
          onToggleLibrary={() => {}}
        />
        <ToastHost />
      </ToastProvider>
    ))
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')

    fireEvent.change(input!, { target: { files: [file] } })

    await waitFor(() => {
      expect(onOpenSession).toHaveBeenCalledWith(session)
    })
    expect(onSessionStored).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        'Replay opened, but it could not be saved to Recordings',
      ),
    ).toBeTruthy()
    expect(warn).toHaveBeenCalledWith(
      '[recorder] could not store imported session',
      storageError,
    )
    unmount()
  })

  it('reports a workspace snapshot failure instead of throwing', () => {
    const error = new Error('timeline snapshot failed')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const onRecordingStarted = vi.fn()
    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderControls
          flameDescriptor={examples.example1}
          startExtras={() => {
            throw error
          }}
          onRecordingStarted={onRecordingStarted}
          onOpenSession={() => {}}
          onSessionStored={() => {}}
          onToggleLibrary={() => {}}
        />
        <ToastHost />
      </ToastProvider>
    ))

    fireEvent.click(screen.getByRole('button', { name: 'Record steps' }))

    expect(
      screen.getByText(
        'Recording could not start — the workspace state could not be captured',
      ),
    ).toBeTruthy()
    expect(warn).toHaveBeenCalledWith(
      '[recorder] could not capture the workspace state',
      error,
    )
    expect(isSessionRecording()).toBe(false)
    expect(onRecordingStarted).not.toHaveBeenCalled()
    unmount()
  })

  it('uses a truthful message for bounded-schema rejection', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const onRecordingStarted = vi.fn()
    const invalid = deepClone(examples.example1)
    invalid.renderSettings.gamma = Number.NaN
    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderControls
          flameDescriptor={invalid}
          onRecordingStarted={onRecordingStarted}
          onOpenSession={() => {}}
          onSessionStored={() => {}}
          onToggleLibrary={() => {}}
        />
        <ToastHost />
      </ToastProvider>
    ))

    fireEvent.click(screen.getByRole('button', { name: 'Record steps' }))

    expect(
      screen.getByText(
        'Recording could not start — this workspace cannot be recorded safely',
      ),
    ).toBeTruthy()
    expect(isSessionRecording()).toBe(false)
    expect(onRecordingStarted).not.toHaveBeenCalled()
    unmount()
  })

  it('runs start side effects only after recording begins', () => {
    const onRecordingStarted = vi.fn()
    const { unmount } = render(() => (
      <ToastProvider>
        <SessionRecorderControls
          flameDescriptor={examples.example1}
          onRecordingStarted={onRecordingStarted}
          onOpenSession={() => {}}
          onSessionStored={() => {}}
          onToggleLibrary={() => {}}
        />
        <ToastHost />
      </ToastProvider>
    ))

    fireEvent.click(screen.getByRole('button', { name: 'Record steps' }))

    expect(isSessionRecording()).toBe(true)
    expect(onRecordingStarted).toHaveBeenCalledTimes(1)
    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.getAttribute('aria-atomic')).toBe('true')
    expect(status.textContent).toContain('0 replayable steps')
    unmount()
  })
})
