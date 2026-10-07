import { beforeEach, describe, expect, it } from 'vitest'
import { eventToClip } from './eventToClip'

/** A canvas that can be moved without being resized, as a transform does. */
function movableCanvas(x: number, y: number) {
  const el = document.createElement('div')
  let rect = { x, y, width: 400, height: 800 }
  el.getBoundingClientRect = () => ({
    ...rect,
    top: rect.y,
    left: rect.x,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
    toJSON: () => rect,
  })
  document.body.append(el)
  return {
    el,
    moveTo: (nextY: number) => {
      rect = { ...rect, y: nextY }
    },
  }
}

/** Wheel events carry the moment they happened; the constructor cannot set it. */
function wheelAt(el: HTMLElement, timeStamp: number) {
  const event = new window.WheelEvent('wheel', { bubbles: true })
  Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  el.dispatchEvent(event)
}

describe('eventToClip', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('maps the centre of the element to the origin', () => {
    const { el } = movableCanvas(0, 0)
    const clip = eventToClip({ clientX: 200, clientY: 400 }, el)
    expect([clip.x, clip.y]).toEqual([0, 0])
  })

  it('measures again when a gesture starts on a moved element', () => {
    const { el, moveTo } = movableCanvas(0, 0)
    expect(eventToClip({ clientX: 200, clientY: 400 }, el).y).toBe(0)

    // The rail's sheet opened: the canvas is translated up by 140px. Its size
    // is unchanged, so no ResizeObserver fires.
    moveTo(-140)
    const gesture = new window.PointerEvent('pointerdown', { bubbles: true })
    el.dispatchEvent(gesture)

    // The point under the finger is now 140px above where it was.
    expect(eventToClip({ clientX: 200, clientY: 260 }, el).y).toBe(0)
    expect(eventToClip({ clientX: 200, clientY: 400 }, el).y).toBeCloseTo(-0.35)
  })

  it('takes a burst of wheel events for one gesture', () => {
    const { el, moveTo } = movableCanvas(0, 0)
    wheelAt(el, 1000)
    expect(eventToClip({ clientX: 200, clientY: 400 }, el).y).toBe(0)

    // A trackpad zoom is 60-120 wheel events a second and the canvas holds
    // still through all of them; one measurement covers the burst.
    moveTo(-140)
    wheelAt(el, 1016)
    expect(eventToClip({ clientX: 200, clientY: 400 }, el).y).toBe(0)

    // The burst ended, so the next turn of the wheel measures again.
    wheelAt(el, 1600)
    expect(eventToClip({ clientX: 200, clientY: 260 }, el).y).toBe(0)
  })

  it('keeps the rect within one gesture', () => {
    const { el, moveTo } = movableCanvas(0, 0)
    el.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }))
    expect(eventToClip({ clientX: 200, clientY: 400 }, el).y).toBe(0)
    // A move between samples must not cost a measurement per pointermove.
    moveTo(-140)
    expect(eventToClip({ clientX: 200, clientY: 400 }, el).y).toBe(0)
  })
})
