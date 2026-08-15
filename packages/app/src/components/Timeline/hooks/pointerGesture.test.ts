import { fireEvent } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import { startPointerGesture } from './pointerGesture'

function installPointerCapture(target: HTMLElement) {
  const captured = new Set<number>()
  const setPointerCapture = vi.fn((pointerId: number) => {
    captured.add(pointerId)
  })
  const releasePointerCapture = vi.fn((pointerId: number) => {
    captured.delete(pointerId)
  })
  const hasPointerCapture = vi.fn((pointerId: number) =>
    captured.has(pointerId),
  )

  Object.defineProperties(target, {
    setPointerCapture: { configurable: true, value: setPointerCapture },
    releasePointerCapture: {
      configurable: true,
      value: releasePointerCapture,
    },
    hasPointerCapture: { configurable: true, value: hasPointerCapture },
  })

  return { captured, setPointerCapture, releasePointerCapture }
}

function startOnPointerDown(
  target: HTMLElement,
  onMove: (event: PointerEvent) => void,
  onEnd: Parameters<typeof startPointerGesture>[0]['onEnd'],
): () => void {
  let stop: (() => void) | undefined
  target.addEventListener(
    'pointerdown',
    (event) => {
      stop = startPointerGesture({
        pointerDownEvent: event,
        onMove,
        onEnd,
      })
    },
    { once: true },
  )
  fireEvent.pointerDown(target, { pointerId: 7, button: 0 })
  if (!stop) throw new Error('gesture did not start')
  return stop
}

describe('startPointerGesture', () => {
  it('ignores other pointers without mutating or ending the gesture', () => {
    const target = document.createElement('div')
    const capture = installPointerCapture(target)
    const onMove = vi.fn()
    const onEnd = vi.fn()
    const stop = startOnPointerDown(target, onMove, onEnd)

    fireEvent.pointerMove(window, { pointerId: 8, clientX: 100 })
    fireEvent.pointerUp(window, { pointerId: 8 })
    fireEvent.pointerCancel(window, { pointerId: 8 })

    expect(onMove).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()

    fireEvent.pointerMove(window, { pointerId: 7, clientX: 120 })
    expect(onMove).toHaveBeenCalledTimes(1)

    fireEvent.pointerUp(window, { pointerId: 7 })
    expect(onEnd).toHaveBeenCalledWith('pointerup', expect.any(PointerEvent))
    expect(capture.releasePointerCapture).toHaveBeenCalledOnce()
    expect(capture.captured.size).toBe(0)

    fireEvent.pointerMove(window, { pointerId: 7, clientX: 140 })
    stop()
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('filters lost capture and converges cancellation on one cleanup', () => {
    const target = document.createElement('div')
    const capture = installPointerCapture(target)
    const onEnd = vi.fn()
    const stop = startOnPointerDown(target, vi.fn(), onEnd)

    fireEvent(target, new PointerEvent('lostpointercapture', { pointerId: 8 }))
    expect(onEnd).not.toHaveBeenCalled()

    capture.captured.delete(7)
    fireEvent(target, new PointerEvent('lostpointercapture', { pointerId: 7 }))
    fireEvent.pointerCancel(window, { pointerId: 7 })
    stop()

    expect(onEnd).toHaveBeenCalledOnce()
    expect(onEnd).toHaveBeenCalledWith(
      'lostpointercapture',
      expect.any(PointerEvent),
    )
    expect(capture.releasePointerCapture).not.toHaveBeenCalled()
  })

  it('releases capture exactly once when stopped by component cleanup', () => {
    const target = document.createElement('div')
    const capture = installPointerCapture(target)
    const onEnd = vi.fn()
    const stop = startOnPointerDown(target, vi.fn(), onEnd)

    stop()
    stop()
    fireEvent.pointerUp(window, { pointerId: 7 })

    expect(onEnd).toHaveBeenCalledOnce()
    expect(onEnd).toHaveBeenCalledWith('stopped', undefined)
    expect(capture.releasePointerCapture).toHaveBeenCalledOnce()
  })
})
