/**
 * The split view's point: the handle sits over c, or waits at the pane's
 * edge while c is off it, and the arrow keys and a drag move c by exactly
 * the pixels travelled. A right-button press on the Mandelbrot pane puts c
 * under the pointer and keeps it there, with a mouse or with a pen's barrel
 * button, and that press never also pans the pane it shares a canvas with.
 */
import { pointAt } from '@chaos-master/core'
import { cleanup, render } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachExplorerInput } from './explorerInput'
import { JuliaMarker, shortComplex } from './JuliaMarker'
import type { ComplexString, DeepZoomView } from '@chaos-master/core'

/** The pane the marker measures, set up afresh for each test. */
const pane = vi.hoisted(() => ({
  canvas: undefined as unknown as HTMLCanvasElement,
  /** CSS size, which the canvas reports as clientWidth and clientHeight. */
  width: 800,
  height: 600,
  /** AutoCanvas's size signal, in device pixels: it only says "resized". */
  canvasSize: undefined as unknown as () => { width: number; height: number },
  resize: undefined as unknown as (width: number, height: number) => void,
}))

vi.mock('@/lib/CanvasContext', () => ({
  useCanvas: () => ({
    canvas: pane.canvas,
    canvasSize: () => pane.canvasSize(),
  }),
}))

const VIEW: DeepZoomView = { centerRe: '-0.75', centerIm: '0', zoomLog2: 10 }
/** The pane's smaller side, which fixes the pixel spacing. */
const MIN_DIMENSION = 600
const CENTRE: ComplexString = { re: VIEW.centerRe, im: VIEW.centerIm }

beforeEach(() => {
  // An 800 x 600 CSS px pane at the page origin: its centre is (400, 300).
  pane.width = 800
  pane.height = 600
  const [size, setSize] = createSignal({ width: 1600, height: 1200 })
  pane.canvasSize = size
  pane.resize = (width, height) => {
    pane.width = width
    pane.height = height
    setSize({ width: width * 2, height: height * 2 })
  }
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { get: () => pane.width },
    clientHeight: { get: () => pane.height },
  })
  canvas.getBoundingClientRect = () =>
    new DOMRect(0, 0, pane.width, pane.height)
  canvas.setPointerCapture = () => {}
  document.body.append(canvas)
  pane.canvas = canvas
})

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

function mount(start: ComplexString = CENTRE) {
  const [point, setPoint] = createSignal(start)
  const onPoint = vi.fn(setPoint)
  const { container } = render(() => (
    <JuliaMarker view={() => VIEW} point={point} setPoint={onPoint} />
  ))
  const marker = container.querySelector('button') as HTMLButtonElement
  return { marker, onPoint, point }
}

function pointer(
  target: EventTarget,
  type: string,
  clientX: number,
  clientY: number,
  init: PointerEventInit = {},
) {
  target.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 4,
      pointerType: 'mouse',
      button: 0,
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  )
}

describe('the marker', () => {
  it('sits at the pane centre when c is the view centre', () => {
    const { marker } = mount()
    expect(marker.style.transform).toBe('translate(0px, 0px)')
    expect(marker.hasAttribute('data-outside')).toBe(false)
  })

  it('sits over c, x right and y down', () => {
    const { marker } = mount(pointAt(VIEW, 100, -50, MIN_DIMENSION))
    // c is printed to the view's depth, eight bits past a pixel, so it comes
    // back a few millionths of a pixel from where it was picked.
    const [x, y] = /translate\((.+)px, (.+)px\)/
      .exec(marker.style.transform)!
      .slice(1)
      .map(Number)
    expect(x).toBeCloseTo(100, 4)
    expect(y).toBeCloseTo(-50, 4)
  })

  it('waits at the nearest edge while c is off the pane', () => {
    // 400 px to the edge, less the 18 px that keep the handle on screen.
    const { marker } = mount(pointAt(VIEW, 1000, 0, MIN_DIMENSION))
    expect(marker.style.transform).toBe('translate(382px, 0px)')
    expect(marker.hasAttribute('data-outside')).toBe(true)
  })

  it('follows the edges when the pane is resized', () => {
    const { marker } = mount(pointAt(VIEW, 1000, 1000, MIN_DIMENSION))
    expect(marker.style.transform).toBe('translate(382px, 282px)')
    pane.resize(600, 600)
    expect(marker.style.transform).toBe('translate(282px, 282px)')
    pane.resize(600, 500)
    expect(marker.style.transform).toBe('translate(282px, 232px)')
  })

  it('names c in its label', () => {
    const { marker } = mount({ re: '-0.8', im: '0.156' })
    expect(marker.getAttribute('aria-label')).toContain(
      'c = -0.80000 + 0.15600i',
    )
  })
})

describe('shortComplex', () => {
  it.each([
    [{ re: '-0.8', im: '0.156' }, '-0.80000 + 0.15600i'],
    [{ re: '0.25', im: '-0.5' }, '0.25000 - 0.50000i'],
    [{ re: '0', im: '-0' }, '0.00000 - 0.00000i'],
  ])('writes %o as %s', (c, text) => {
    expect(shortComplex(c)).toBe(text)
  })
})

describe('the arrow keys', () => {
  it.each([
    ['ArrowLeft', false, -2, 0],
    ['ArrowRight', false, 2, 0],
    ['ArrowUp', false, 0, -2],
    ['ArrowDown', false, 0, 2],
    ['ArrowRight', true, 24, 0],
  ])('move c with %s, Shift %s', (key, shiftKey, dx, dy) => {
    const { marker, point } = mount()
    const event = new KeyboardEvent('keydown', {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    })
    marker.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(point()).toEqual(pointAt(VIEW, dx, dy, MIN_DIMENSION))
  })

  it('leave every other key alone', () => {
    const { marker, onPoint } = mount()
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    })
    marker.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(onPoint).not.toHaveBeenCalled()
  })
})

describe('dragging the marker', () => {
  it('moves c by the pointer travel, wherever on the handle it was grabbed', () => {
    const { marker, point } = mount()
    // 5 px right of the handle's centre, which is the pane centre.
    pointer(marker, 'pointerdown', 405, 300)
    pointer(document, 'pointermove', 415, 300)
    pointer(document, 'pointerup', 415, 300)
    expect(point()).toEqual(pointAt(VIEW, 10, 0, MIN_DIMENSION))
  })
})

describe('the right-button pick', () => {
  it('puts c under the pointer and keeps it there until the button is let go', () => {
    const { onPoint, point } = mount()
    pointer(pane.canvas, 'pointerdown', 500, 250, { button: 2 })
    expect(point()).toEqual(pointAt(VIEW, 100, -50, MIN_DIMENSION))
    pointer(pane.canvas, 'pointermove', 520, 260, { button: -1 })
    expect(point()).toEqual(pointAt(VIEW, 120, -40, MIN_DIMENSION))
    pointer(pane.canvas, 'pointerup', 520, 260, { button: 2 })
    pointer(pane.canvas, 'pointermove', 600, 300, { button: -1 })
    expect(onPoint).toHaveBeenCalledTimes(2)
  })

  it('keeps c on the pane when the pointer leaves it', () => {
    const { point } = mount()
    pointer(pane.canvas, 'pointerdown', 500, 250, { button: 2 })
    pointer(pane.canvas, 'pointermove', 2000, 300, { button: -1 })
    expect(point()).toEqual(pointAt(VIEW, 382, 0, MIN_DIMENSION))
  })

  it('keeps the context menu off the pane', () => {
    mount()
    const menu = new MouseEvent('contextmenu', { cancelable: true })
    pane.canvas.dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(true)
  })

  it('leaves the left button to the pane', () => {
    const { onPoint } = mount()
    pointer(pane.canvas, 'pointerdown', 500, 250)
    pointer(pane.canvas, 'pointermove', 520, 260)
    expect(onPoint).not.toHaveBeenCalled()
  })

  it('comes off the canvas when the marker unmounts', () => {
    const { onPoint } = mount()
    cleanup()
    pointer(pane.canvas, 'pointerdown', 500, 250, { button: 2 })
    const menu = new MouseEvent('contextmenu', { cancelable: true })
    pane.canvas.dispatchEvent(menu)
    expect(onPoint).not.toHaveBeenCalled()
    expect(menu.defaultPrevented).toBe(false)
  })

  it("moves c with a pen's barrel button and leaves the view where it is", () => {
    // The pane's own navigation is attached first, as the renderer does.
    const setView = vi.fn()
    const detach = attachExplorerInput(pane.canvas, {
      view: () => VIEW,
      setView,
      gridScale: () => 1,
      minDimension: () => MIN_DIMENSION,
    })
    const { point } = mount()
    const pen = { pointerType: 'pen', button: 2, buttons: 2 }
    pointer(pane.canvas, 'pointerdown', 500, 250, pen)
    pointer(pane.canvas, 'pointermove', 520, 260, { ...pen, button: -1 })
    pointer(pane.canvas, 'pointerup', 520, 260, pen)
    detach()
    expect(point()).toEqual(pointAt(VIEW, 120, -40, MIN_DIMENSION))
    expect(setView).not.toHaveBeenCalled()
  })
})
