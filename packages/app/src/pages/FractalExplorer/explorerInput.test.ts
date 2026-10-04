/**
 * Canvas navigation: a drag pans by exactly the pointer's travel, a pinch
 * pans with the fingers' midpoint and zooms by how far they spread, and the
 * wheel, a double-click and the keyboard zoom or pan by fixed steps. Each
 * view that comes out is compared, digit for digit, with the core's own
 * `panView` and `zoomViewAt`, which is what the explorer promises at any
 * depth.
 */
import { centerOffsetPixels, panView, pointAt, zoomViewAt, } from '@chaos-master/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachExplorerInput } from './explorerInput'
import type { DeepZoomView } from '@chaos-master/core'

const START: DeepZoomView = { centerRe: '-0.75', centerIm: '0', zoomLog2: 10 }
/** The render grid's smaller side: 600 CSS px at 2 grid px each. */
const MIN_DIMENSION = 1200

let detach: (() => void) | undefined

afterEach(() => {
  detach?.()
  detach = undefined
  document.body.replaceChildren()
})

/** An 800 x 600 CSS px canvas at (100, 50), so its centre is at (500, 350). */
function setup() {
  const element = document.createElement('div')
  document.body.append(element)
  element.getBoundingClientRect = () => new DOMRect(100, 50, 800, 600)
  element.setPointerCapture = () => {}
  let view = START
  const setView = vi.fn((next: DeepZoomView) => {
    view = next
  })
  detach = attachExplorerInput(element, {
    view: () => view,
    setView,
    gridScale: () => 2,
    minDimension: () => MIN_DIMENSION,
  })

  function pointer(
    type: string,
    pointerId: number,
    clientX: number,
    clientY: number,
    init: PointerEventInit = {},
  ) {
    element.dispatchEvent(
      new PointerEvent(type, {
        pointerId,
        pointerType: 'touch',
        button: 0,
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    )
  }
  return { element, setView, view: () => view, pointer }
}

describe('a pinch', () => {
  it('pans with the midpoint and zooms by the spread', () => {
    const { pointer, view } = setup()
    pointer('pointerdown', 1, 300, 300)
    pointer('pointerdown', 2, 500, 300)
    // The midpoint moves 100 px right and the spread doubles.
    pointer('pointermove', 2, 700, 300)
    expect(view()).toEqual(
      zoomViewAt(
        panView(START, 200, 0, MIN_DIMENSION),
        0,
        -100,
        MIN_DIMENSION,
        1,
      ),
    )
  })

  it('keeps the point that was under the midpoint under it', () => {
    const { pointer, view } = setup()
    // The midpoint starts at (400, 300), 200 grid px left of the centre and
    // 100 above it, and ends at (500, 300), 100 straight above it.
    const held = pointAt(START, -200, -100, MIN_DIMENSION)
    pointer('pointerdown', 1, 300, 300)
    pointer('pointerdown', 2, 500, 300)
    pointer('pointermove', 2, 700, 300)
    // The centre relative to that point, y up. Each view prints its centre
    // to its own depth, so the two agree to a far smaller part of a pixel
    // than the eight bits a printed view keeps, not to the last digit.
    const offset = centerOffsetPixels(view(), held, MIN_DIMENSION)
    expect(offset.x).toBeCloseTo(0, 4)
    expect(offset.y).toBeCloseTo(-100, 4)
  })

  it('waits for fingers that land on one pixel to spread before zooming', () => {
    const { pointer, setView, view } = setup()
    pointer('pointerdown', 1, 400, 300)
    pointer('pointerdown', 2, 400, 300)
    pointer('pointermove', 2, 500, 300)
    expect(setView).not.toHaveBeenCalled()
    pointer('pointermove', 2, 600, 300)
    expect(view()).toEqual(
      zoomViewAt(
        panView(START, 100, 0, MIN_DIMENSION),
        0,
        -100,
        MIN_DIMENSION,
        1,
      ),
    )
  })

  it('holds the zoom when the fingers meet, and zooms back as they part', () => {
    const { pointer, view } = setup()
    pointer('pointerdown', 1, 300, 300)
    pointer('pointerdown', 2, 500, 300)
    // 200 px apart to 100: one octave out.
    pointer('pointermove', 1, 400, 300)
    const apart = view()
    expect(apart.zoomLog2).toBe(9)

    // Both fingers on one pixel: there is no spread to compare with.
    pointer('pointermove', 2, 400, 300)
    expect(view()).toBe(apart)

    // 200 px apart again, measured from the last spread that had a size.
    pointer('pointermove', 2, 600, 300)
    expect(view()).toEqual(
      zoomViewAt(
        panView(apart, 100, 0, MIN_DIMENSION),
        0,
        -100,
        MIN_DIMENSION,
        1,
      ),
    )
    expect(view().zoomLog2).toBe(10)
  })
})

describe('a drag', () => {
  it.each(['mouse', 'pen', 'touch'])(
    'pans a %s drag by its travel in grid pixels',
    (type) => {
      const { pointer, view } = setup()
      pointer('pointerdown', 7, 500, 300, { pointerType: type })
      pointer('pointermove', 7, 510, 290, { pointerType: type })
      expect(view()).toEqual(panView(START, 20, -20, MIN_DIMENSION))
    },
  )

  // The right button belongs to the split view's point and the middle one to
  // the browser. A pen's barrel button is its right button.
  it.each([
    ['mouse', 1],
    ['mouse', 2],
    ['pen', 2],
  ])(
    'leaves the view alone for a %s pressed with button %i',
    (type, button) => {
      const { pointer, setView } = setup()
      pointer('pointerdown', 7, 500, 300, { pointerType: type, button })
      pointer('pointermove', 7, 540, 320, { pointerType: type })
      expect(setView).not.toHaveBeenCalled()
    },
  )

  it('does not set the view for a move that goes nowhere', () => {
    const { pointer, setView } = setup()
    pointer('pointerdown', 7, 500, 300)
    pointer('pointermove', 7, 500, 300)
    expect(setView).not.toHaveBeenCalled()
  })

  it.each(['pointerup', 'pointercancel'])(
    'forgets a pointer after %s',
    (end) => {
      const { pointer, setView } = setup()
      pointer('pointerdown', 7, 500, 300)
      pointer(end, 7, 500, 300)
      pointer('pointermove', 7, 540, 320)
      expect(setView).not.toHaveBeenCalled()
    },
  )
})

describe('the wheel', () => {
  function wheel(
    element: HTMLElement,
    deltaY: number,
    deltaMode = 0,
  ): WheelEvent {
    const event = new WheelEvent('wheel', {
      deltaY,
      deltaMode,
      cancelable: true,
    })
    // A browser's WheelEvent is a MouseEvent; happy-dom's has no position, so
    // it gets one: 100 CSS px right of the centre and 50 below it.
    Object.defineProperties(event, {
      clientX: { value: 600 },
      clientY: { value: 400 },
    })
    element.dispatchEvent(event)
    return event
  }

  it('zooms half an octave a notch, about the pointer, and keeps the page still', () => {
    const { element, view } = setup()
    expect(wheel(element, -100).defaultPrevented).toBe(true)
    expect(view()).toEqual(zoomViewAt(START, 200, 100, MIN_DIMENSION, 0.5))
  })

  it.each([
    ['lines', -3, 1, 0.495],
    ['pages', -0.5, 2, 1],
    ['pixels, flung', -1e5, 0, 2],
    ['pixels, flung out', 1e5, 0, -2],
  ])('zooms a wheel counted in %s', (_, deltaY, deltaMode, octaves) => {
    const { element, view } = setup()
    wheel(element, deltaY, deltaMode)
    expect(view()).toEqual(zoomViewAt(START, 200, 100, MIN_DIMENSION, octaves))
  })
})

describe('a double-click', () => {
  it.each([
    [false, 1],
    [true, -1],
  ])('with Shift %s zooms %i octave about the pointer', (shiftKey, octaves) => {
    const { element, view } = setup()
    element.dispatchEvent(
      new MouseEvent('dblclick', { clientX: 600, clientY: 400, shiftKey }),
    )
    expect(view()).toEqual(zoomViewAt(START, 200, 100, MIN_DIMENSION, octaves))
  })
})

describe('the keyboard', () => {
  function key(element: HTMLElement, init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { cancelable: true, ...init })
    element.dispatchEvent(event)
    return event
  }

  // A tenth of the 600 CSS px side, at 2 grid px each.
  it.each([
    ['ArrowLeft', 120, 0],
    ['ArrowRight', -120, 0],
    ['ArrowUp', 0, 120],
    ['ArrowDown', 0, -120],
  ])('pans with %s', (name, dx, dy) => {
    const { element, view } = setup()
    expect(key(element, { key: name }).defaultPrevented).toBe(true)
    expect(view()).toEqual(panView(START, dx, dy, MIN_DIMENSION))
  })

  it.each([
    ['+', 1],
    ['=', 1],
    ['-', -1],
    ['_', -1],
  ])('zooms about the centre with %s', (name, octaves) => {
    const { element, view } = setup()
    expect(key(element, { key: name }).defaultPrevented).toBe(true)
    expect(view()).toEqual(zoomViewAt(START, 0, 0, MIN_DIMENSION, octaves))
  })

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Alt', { altKey: true }],
  ])('leaves %s with + to the browser', (_, modifier) => {
    const { element, setView } = setup()
    expect(key(element, { key: '+', ...modifier }).defaultPrevented).toBe(false)
    expect(setView).not.toHaveBeenCalled()
  })

  it('ignores a key it has no use for', () => {
    const { element, setView } = setup()
    expect(key(element, { key: 'a' }).defaultPrevented).toBe(false)
    expect(setView).not.toHaveBeenCalled()
  })
})

describe('detaching', () => {
  it('removes every listener', () => {
    const { element, pointer, setView } = setup()
    detach?.()
    detach = undefined
    pointer('pointerdown', 7, 500, 300)
    pointer('pointermove', 7, 540, 320)
    element.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -100, cancelable: true }),
    )
    element.dispatchEvent(new MouseEvent('dblclick'))
    element.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }))
    expect(setView).not.toHaveBeenCalled()
  })
})
