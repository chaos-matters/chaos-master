import { render } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DelayedShow } from './DelayedShow'

// These tests render the real DelayedShow component and assert on the DOM it
// produces, rather than re-implementing setTimeout/Show logic inline.
describe('DelayedShow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the fallback before the delay elapses, children after', () => {
    const { container, unmount } = render(() => (
      <DelayedShow delayMs={100} fallback={<span>loading</span>}>
        <span>content</span>
      </DelayedShow>
    ))

    // Before the timer fires, only the fallback is visible.
    expect(container.textContent).toBe('loading')

    vi.advanceTimersByTime(99)
    expect(container.textContent).toBe('loading')

    // Once the delay elapses the children replace the fallback.
    vi.advanceTimersByTime(1)
    expect(container.textContent).toBe('content')

    unmount()
  })

  it('renders nothing before the delay when no fallback is given', () => {
    const { container, unmount } = render(() => (
      <DelayedShow delayMs={50}>
        <span>content</span>
      </DelayedShow>
    ))

    expect(container.textContent).toBe('')

    vi.advanceTimersByTime(50)
    expect(container.textContent).toBe('content')

    unmount()
  })

  it('clears the pending timeout on unmount so children never show', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { container, unmount } = render(() => (
      <DelayedShow delayMs={100} fallback={<span>loading</span>}>
        <span>content</span>
      </DelayedShow>
    ))

    expect(container.textContent).toBe('loading')

    unmount()
    expect(clearTimeoutSpy).toHaveBeenCalled()

    // The timer would have fired here, but cleanup cancelled it.
    vi.advanceTimersByTime(200)
    expect(container.textContent).toBe('')
  })

  it('restarts the delay when delayMs changes reactively', () => {
    const [delayMs, setDelayMs] = createSignal(100)
    const { container, unmount } = render(() => (
      <DelayedShow delayMs={delayMs()} fallback={<span>loading</span>}>
        <span>content</span>
      </DelayedShow>
    ))

    // Let part of the first delay pass, then change it: the effect re-runs and
    // the timer restarts from the new value.
    vi.advanceTimersByTime(60)
    setDelayMs(200)
    vi.advanceTimersByTime(60)
    expect(container.textContent).toBe('loading')

    vi.advanceTimersByTime(140)
    expect(container.textContent).toBe('content')

    unmount()
  })
})
