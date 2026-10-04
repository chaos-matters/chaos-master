/**
 * A sideways drag on a text input scrubs it, Shift ten times finer; a press
 * that barely moves, which a finger may do further than a mouse, focuses the
 * input for typing, and an input being edited keeps its caret.
 */
import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInputScrub } from './createInputScrub'
import type { InputScrub } from './createInputScrub'

afterEach(() => {
  cleanup()
})

function Field(props: InputScrub) {
  const scrub = createInputScrub(props)
  return <input aria-label="value" value="12.5" onPointerDown={scrub} />
}

function mount() {
  const onStart = vi.fn()
  const onScrub = vi.fn()
  render(() => <Field onStart={onStart} onScrub={onScrub} />)
  return { input: screen.getByLabelText('value'), onStart, onScrub }
}

const pointer = (type: string) => ({
  pointerId: 3,
  pointerType: type,
  button: 0,
  bubbles: true,
  cancelable: true,
})

function press(input: HTMLElement, type = 'mouse', x = 100): PointerEvent {
  const down = new PointerEvent('pointerdown', { ...pointer(type), clientX: x })
  input.dispatchEvent(down)
  return down
}

function moveTo(x: number, type = 'mouse', shiftKey = false, y = 0) {
  document.dispatchEvent(
    new PointerEvent('pointermove', {
      ...pointer(type),
      clientX: x,
      clientY: y,
      shiftKey,
    }),
  )
}

function release(x: number, type = 'mouse') {
  document.dispatchEvent(
    new PointerEvent('pointerup', { ...pointer(type), clientX: x }),
  )
}

describe('createInputScrub', () => {
  it.each(['mouse', 'pen', 'touch'])(
    'reports a sideways %s drag, step by step, past a small dead zone',
    (type) => {
      const { input, onStart, onScrub } = mount()
      press(input, type)
      moveTo(103, type)
      expect(onStart).not.toHaveBeenCalled()
      moveTo(110, type)
      moveTo(90, type)
      release(90, type)
      expect(onStart).toHaveBeenCalledOnce()
      expect(onScrub.mock.calls).toEqual([[10], [-20]])
      expect(document.activeElement).not.toBe(input)
    },
  )

  it('still taps the field when a finger drifts a few pixels sideways', () => {
    const { input, onStart, onScrub } = mount()
    press(input, 'touch')
    moveTo(106, 'touch')
    release(106, 'touch')
    expect(onStart).not.toHaveBeenCalled()
    expect(onScrub).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(input)
  })

  it('scrubs a finger past its wider dead zone, counting from the press', () => {
    const { input, onStart, onScrub } = mount()
    press(input, 'touch')
    moveTo(112, 'touch')
    release(112, 'touch')
    expect(onStart).toHaveBeenCalledOnce()
    expect(onScrub.mock.calls).toEqual([[12]])
  })

  it.each(['mouse', 'pen'])('scrubs a %s from 4 px', (type) => {
    const { input, onStart, onScrub } = mount()
    press(input, type)
    moveTo(103, type)
    expect(onStart).not.toHaveBeenCalled()
    moveTo(104, type)
    release(104, type)
    expect(onStart).toHaveBeenCalledOnce()
    expect(onScrub.mock.calls).toEqual([[4]])
  })

  it('reports nothing for a wobble up or down mid-scrub', () => {
    const { input, onScrub } = mount()
    press(input)
    moveTo(110)
    moveTo(110, 'mouse', false, 6)
    release(110)
    expect(onScrub.mock.calls).toEqual([[10]])
  })

  it('does nothing on an element that is not an input', () => {
    const onStart = vi.fn()
    const onScrub = vi.fn()

    function Box() {
      const scrub = createInputScrub({ onStart, onScrub })
      return <div aria-label="box" onPointerDown={scrub} />
    }
    render(() => <Box />)
    const down = press(screen.getByLabelText('box'))
    moveTo(160)
    release(160)
    expect(down.defaultPrevented).toBe(false)
    expect(onStart).not.toHaveBeenCalled()
    expect(onScrub).not.toHaveBeenCalled()
  })

  it('is ten times finer with Shift held', () => {
    const { input, onScrub } = mount()
    press(input)
    moveTo(110)
    moveTo(130, 'mouse', true)
    release(130)
    expect(onScrub.mock.calls).toEqual([[10], [2]])
  })

  it('focuses the field and selects its text on a press that does not move', () => {
    const { input, onScrub } = mount()
    press(input)
    moveTo(102)
    release(102)
    expect(onScrub).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(input)
    const field = input as HTMLInputElement
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 4])
  })

  it('leaves a mostly vertical drag alone, drift and all', () => {
    const { input, onStart, onScrub } = mount()
    press(input, 'touch')
    moveTo(103, 'touch', false, 12)
    moveTo(106, 'touch', false, 30)
    release(106, 'touch')
    expect(onStart).not.toHaveBeenCalled()
    expect(onScrub).not.toHaveBeenCalled()
  })

  it('does not focus the field when the browser takes the gesture to scroll', () => {
    const { input, onScrub } = mount()
    press(input, 'touch')
    document.dispatchEvent(
      new PointerEvent('pointercancel', { ...pointer('touch'), clientX: 100 }),
    )
    expect(document.activeElement).not.toBe(input)
    expect(onScrub).not.toHaveBeenCalled()
  })

  it('keeps a mouse press from selecting text, and leaves a tap to the browser', () => {
    const { input } = mount()
    expect(press(input, 'mouse').defaultPrevented).toBe(true)
    release(100, 'mouse')
    input.blur()
    expect(press(input, 'touch').defaultPrevented).toBe(false)
    release(100, 'touch')
  })

  it('leaves a field being edited to its caret', () => {
    const { input, onScrub } = mount()
    input.focus()
    const down = press(input)
    moveTo(160)
    release(160)
    expect(down.defaultPrevented).toBe(false)
    expect(onScrub).not.toHaveBeenCalled()
  })
})
