/**
 * Palette stops, and the point on the colour plane, drag with any pointer, a
 * finger included; the selection stays on the dragged stop when it passes a
 * neighbour.
 */
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CustomPaletteEditor } from './CustomPaletteEditor'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const BAR_WIDTH = 200

function rectOf(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width,
    height,
    right: width,
    bottom: height,
    toJSON: () => ({}),
  }
}

function handles(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-stop-id]')]
}

function handleAt(left: string): HTMLElement {
  const handle = handles().find((h) => h.style.left === left)
  if (!handle) throw new Error(`no stop at ${left}`)
  return handle
}

/** The editor's default two stops (0% and 100%) plus one clicked in at 50%. */
function renderWithThreeStops() {
  render(() => <CustomPaletteEditor onSave={vi.fn()} onCancel={vi.fn()} />)
  const bar = handles()[0]!.parentElement!
  vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue(rectOf(BAR_WIDTH, 40))
  fireEvent.click(bar, { clientX: BAR_WIDTH / 2 })
  expect(handles()).toHaveLength(3)
}

function drag(handle: HTMLElement, fromX: number, toX: number, type: string) {
  const init = { pointerId: 7, pointerType: type, button: 0, bubbles: true }
  handle.dispatchEvent(
    new PointerEvent('pointerdown', { ...init, clientX: fromX, clientY: 20 }),
  )
  document.dispatchEvent(
    new PointerEvent('pointermove', { ...init, clientX: toX, clientY: 20 }),
  )
  document.dispatchEvent(
    new PointerEvent('pointerup', { ...init, clientX: toX, clientY: 20 }),
  )
}

describe('CustomPaletteEditor stop dragging', () => {
  it.each(['touch', 'mouse', 'pen'])('moves a stop dragged by %s', (type) => {
    renderWithThreeStops()
    const first = handleAt('0%')
    const id = first.dataset.stopId
    drag(first, 0, BAR_WIDTH * 0.25, type)
    expect(handleAt('25%').dataset.stopId).toBe(id)
  })

  it('keeps the dragged stop selected as it passes a neighbour', () => {
    renderWithThreeStops()
    const first = handleAt('0%')
    const id = first.dataset.stopId
    drag(first, 0, BAR_WIDTH * 0.75, 'touch')

    const moved = handleAt('75%')
    expect(moved.dataset.stopId).toBe(id)
    expect(screen.getByText(/Stop 2 \/ 3/)).toBeTruthy()

    fireEvent.click(screen.getByText('Delete Stop'))
    const left = handles().map((h) => h.dataset.stopId)
    expect(left).toHaveLength(2)
    expect(left).not.toContain(id)
  })

  it('does not nudge a stop that is only tapped', () => {
    renderWithThreeStops()
    const middle = handleAt('50%')
    drag(middle, BAR_WIDTH / 2, BAR_WIDTH / 2 + 2, 'touch')
    expect(handleAt('50%')).toBe(middle)
  })
})

describe('CustomPaletteEditor colour plane', () => {
  it.each(['touch', 'mouse', 'pen'])(
    'puts the point where %s presses, and drags it',
    (type) => {
      renderWithThreeStops()
      // Pressing a stop without moving it selects it.
      drag(handleAt('50%'), BAR_WIDTH / 2, BAR_WIDTH / 2, type)
      fireEvent.click(screen.getByText('Edit Color'))
      const plane = document.querySelector<HTMLElement>('.oklabPicker')!
      vi.spyOn(plane, 'getBoundingClientRect').mockReturnValue(rectOf(200, 160))
      const point = () => {
        const style = document.querySelector<HTMLElement>('.crosshair')!.style
        return [style.left, style.top]
      }
      const init = { pointerId: 9, pointerType: type, button: 0, bubbles: true }
      plane.dispatchEvent(
        new PointerEvent('pointerdown', { ...init, clientX: 50, clientY: 40 }),
      )
      expect(point()).toEqual(['25%', '25%'])
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          ...init,
          clientX: 150,
          clientY: 120,
        }),
      )
      expect(point()).toEqual(['75%', '75%'])
      document.dispatchEvent(
        new PointerEvent('pointerup', { ...init, clientX: 150, clientY: 120 }),
      )
      // Past the edge, the point stays on the plane.
      plane.dispatchEvent(
        new PointerEvent('pointerdown', {
          ...init,
          clientX: -30,
          clientY: 400,
        }),
      )
      expect(point()).toEqual(['0%', '100%'])
    },
  )
})
