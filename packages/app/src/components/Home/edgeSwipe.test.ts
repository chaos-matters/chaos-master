import { createRoot } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHomeEdgeSwipe, EDGE_SWIPE_DISTANCE_PX, EDGE_SWIPE_START_PX, } from './edgeSwipe'

const popBack = vi.fn(() => true)
vi.mock('@/lib/backStack', () => ({
  popBack: () => popBack(),
}))

/** One pointer, from `fromX` to `toX`, in two moves. */
function swipe(fromX: number, toX: number, pointerType = 'touch') {
  let dispose = () => {}
  createRoot((disposeRoot) => {
    dispose = disposeRoot
    const start = createHomeEdgeSwipe()
    const target = document.createElement('div')
    document.body.append(target)
    const point = (type: string, clientX: number) => {
      const event = new window.PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY: 400,
        pointerId: 1,
      })
      // The constructor's init is not enough in this DOM, and pointerType is
      // the whole point of the mouse case below.
      Object.defineProperty(event, 'pointerType', { value: pointerType })
      return event
    }
    start(point('pointerdown', fromX))
    const half = fromX + (toX - fromX) / 2
    document.dispatchEvent(point('pointermove', half))
    document.dispatchEvent(point('pointermove', toX))
    document.dispatchEvent(point('pointerup', toX))
    target.remove()
  })
  dispose()
}

describe('the Home edge swipe', () => {
  afterEach(() => {
    popBack.mockClear()
  })

  it('pops back once for a swipe in from the leading edge', () => {
    swipe(EDGE_SWIPE_START_PX - 4, EDGE_SWIPE_START_PX - 4 + 200)
    expect(popBack).toHaveBeenCalledTimes(1)
  })

  it('ignores a mouse drag, which is not this gesture', () => {
    // createDragHandler starts on mouse button 0 by default, and the leading
    // 24px of Home on the desktop web is the section rail's gutter, the brand
    // text and the Overview button. A left-button press there dragged 60px to
    // the right would have popped the registry and dropped the user into the
    // editor mid-drag. The gesture stands in for the back iOS does not have.
    swipe(4, 204, 'mouse')
    expect(popBack).not.toHaveBeenCalled()
  })

  it('ignores a swipe that started away from the edge', () => {
    swipe(100, 300)
    expect(popBack).not.toHaveBeenCalled()
  })

  it('ignores a short drag at the edge, so a scroll is not a dismissal', () => {
    swipe(4, 4 + EDGE_SWIPE_DISTANCE_PX - 1)
    expect(popBack).not.toHaveBeenCalled()
  })
})
