import { createRoot } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'
import { createPinchHandler, isUsablePinch, pinchEventFrom, } from './createPinchHandler'
import type { PinchPoint } from './createPinchHandler'

const p = (clientX: number, clientY: number) => ({ clientX, clientY })

describe('pinchEventFrom', () => {
  it('computes midpoint and distance for two distinct touches', () => {
    const e = pinchEventFrom(p(0, 0), p(6, 8))
    expect(e.midpoint).toEqual({ clientX: 3, clientY: 4 })
    expect(e.distance).toBe(10)
  })
})

describe('isUsablePinch', () => {
  it('rejects two coincident touches, which is what a fast two-finger tap reports', () => {
    expect(isUsablePinch(pinchEventFrom(p(120, 240), p(120, 240)))).toBe(false)
  })

  it('rejects a non-finite coordinate', () => {
    expect(isUsablePinch(pinchEventFrom(p(NaN, 0), p(6, 8)))).toBe(false)
    expect(isUsablePinch(pinchEventFrom(p(0, 0), p(Infinity, 8)))).toBe(false)
  })

  it('accepts an ordinary pinch', () => {
    expect(isUsablePinch(pinchEventFrom(p(0, 0), p(6, 8)))).toBe(true)
  })
})

/** A touch event carrying these touches, as the handler reads them. */
const touchEvent = (type: string, ...points: PinchPoint[]) => {
  const event = new Event(type)
  Object.defineProperty(event, 'touches', { value: points })
  return event as TouchEvent
}

describe('createPinchHandler', () => {
  const start = () => {
    const onPinchMove = vi.fn()
    const createHandlers = vi.fn(() => ({ onPinchMove }))
    let dispose!: () => void
    const startPinch = createRoot((d) => {
      dispose = d
      return createPinchHandler(createHandlers)
    })
    return { startPinch, createHandlers, onPinchMove, dispose }
  }

  it('never starts a pinch from two coincident touches', () => {
    const { startPinch, createHandlers, dispose } = start()
    startPinch(touchEvent('touchstart', p(120, 240), p(120, 240)))
    expect(createHandlers).not.toHaveBeenCalled()
    dispose()
  })

  it('drops a move whose touches coincide and passes the next usable one', () => {
    const { startPinch, onPinchMove, dispose } = start()
    startPinch(touchEvent('touchstart', p(0, 0), p(6, 8)))

    document.dispatchEvent(touchEvent('touchmove', p(50, 50), p(50, 50)))
    expect(onPinchMove).not.toHaveBeenCalled()

    document.dispatchEvent(touchEvent('touchmove', p(0, 0), p(12, 16)))
    expect(onPinchMove).toHaveBeenCalledOnce()
    expect(onPinchMove.mock.calls[0]![0]).toMatchObject({ distance: 20 })

    document.dispatchEvent(touchEvent('touchend'))
    dispose()
  })
})
