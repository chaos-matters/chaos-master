import { fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastHost } from '@/components/Toast/Toast'
import { ToastProvider } from '@/contexts/ToastContext'
import { examples } from '@/flame/examples'
import { cancelSessionRecording, isSessionRecording } from '@/recorder/recorder'
import { deepClone } from '@/utils/clone'
import { SessionRecorderControls } from './SessionRecorderControls'

describe('SessionRecorderControls start feedback', () => {
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
