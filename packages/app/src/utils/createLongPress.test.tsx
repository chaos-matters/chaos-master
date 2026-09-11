import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLongPress } from './createLongPress'

function mount(options: {
  onTap: () => void
  onLongPress?: () => void
  onPressStart?: () => void
}) {
  render(() => (
    <button type="button" {...createLongPress(options)}>
      Save image
    </button>
  ))
  return screen.getByRole('button')
}

describe('createLongPress', () => {
  afterEach(cleanup)

  it('taps, and holds for the second action', () => {
    vi.useFakeTimers()
    const onTap = vi.fn()
    const onLongPress = vi.fn()
    const button = mount({ onTap, onLongPress })

    fireEvent.pointerDown(button, { pointerId: 1 })
    fireEvent.pointerUp(button, { pointerId: 1 })
    fireEvent.click(button)
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(onLongPress).not.toHaveBeenCalled()

    fireEvent.pointerDown(button, { pointerId: 1 })
    vi.advanceTimersByTime(600)
    fireEvent.pointerUp(button, { pointerId: 1 })
    fireEvent.click(button)
    expect(onLongPress).toHaveBeenCalledTimes(1)
    expect(onTap).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('does not fire once the finger that started the press has lifted', () => {
    vi.useFakeTimers()
    const onTap = vi.fn()
    const onLongPress = vi.fn()
    const button = mount({ onTap, onLongPress })

    // A second finger lands on the same button and the first one lifts. The
    // press belongs to the first finger, so nothing is left running to open
    // the export options with no finger on the screen.
    fireEvent.pointerDown(button, { pointerId: 1 })
    fireEvent.pointerDown(button, { pointerId: 2 })
    fireEvent.pointerUp(button, { pointerId: 1 })
    vi.advanceTimersByTime(600)
    expect(onLongPress).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('ignores a second finger while the first still holds', () => {
    vi.useFakeTimers()
    const onTap = vi.fn()
    const onLongPress = vi.fn()
    const button = mount({ onTap, onLongPress })

    // Finger A holds the shutter for the options while finger B taps it.
    // The pointer guard covered the ups but not the click, so B's tap saved
    // an image and A's hold then opened the options: two from one press.
    fireEvent.pointerDown(button, { pointerId: 1 })
    fireEvent.pointerDown(button, { pointerId: 2 })
    fireEvent.pointerUp(button, { pointerId: 2 })
    fireEvent.click(button)
    expect(onTap).not.toHaveBeenCalled()

    vi.advanceTimersByTime(600)
    expect(onLongPress).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('taps from the keyboard, where no pointer is involved', () => {
    const onTap = vi.fn()
    const button = mount({ onTap, onLongPress: vi.fn() })
    fireEvent.click(button)
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('captures the pointer so the up comes back to the button', () => {
    const captured: number[] = []
    const button = mount({ onTap: vi.fn(), onLongPress: vi.fn() })
    button.setPointerCapture = (pointerId: number) => {
      captured.push(pointerId)
    }
    fireEvent.pointerDown(button, { pointerId: 3 })
    expect(captured).toEqual([3])
  })

  it('takes the press back when the up never arrived', () => {
    vi.useFakeTimers()
    const onTap = vi.fn()
    const onLongPress = vi.fn()
    const onPressStart = vi.fn()
    const button = mount({ onTap, onLongPress, onPressStart })

    // The long press opens a modal dialog. A pointer the browser did not
    // capture lifts onto the dialog, so the button never sees the up and its
    // latch would stay closed over every later tap.
    fireEvent.pointerDown(button, { pointerId: 1 })
    vi.advanceTimersByTime(600)
    expect(onLongPress).toHaveBeenCalledTimes(1)

    fireEvent.pointerDown(button, { pointerId: 2 })
    fireEvent.pointerUp(button, { pointerId: 2 })
    fireEvent.click(button)
    expect(onPressStart).toHaveBeenCalledTimes(2)
    expect(onTap).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('drops the press when the capture is lost', () => {
    vi.useFakeTimers()
    const onLongPress = vi.fn()
    const button = mount({ onTap: vi.fn(), onLongPress })

    // The button left the DOM under the finger, so the up will never come.
    fireEvent.pointerDown(button, { pointerId: 1 })
    fireEvent.lostPointerCapture(button, { pointerId: 1 })
    vi.advanceTimersByTime(600)
    expect(onLongPress).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('ignores a lift from a finger that did not start the press', () => {
    vi.useFakeTimers()
    const onTap = vi.fn()
    const onLongPress = vi.fn()
    const button = mount({ onTap, onLongPress })

    fireEvent.pointerDown(button, { pointerId: 1 })
    fireEvent.pointerUp(button, { pointerId: 9 })
    vi.advanceTimersByTime(600)
    expect(onLongPress).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
