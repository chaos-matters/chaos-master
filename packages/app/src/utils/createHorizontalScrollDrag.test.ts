import { createSignal } from 'solid-js'
import { describe, expect, it } from 'vitest'
import { createHorizontalScrollDrag } from './createHorizontalScrollDrag'

describe('createHorizontalScrollDrag', () => {
  it('translates vertical wheel scrolling to horizontal scrollLeft', () => {
    const [el, setEl] = createSignal<HTMLDivElement>()
    const div = document.createElement('div')
    div.scrollLeft = 0
    setEl(div)

    createHorizontalScrollDrag(el)

    const wheelEvent = new WheelEvent('wheel', {
      deltaY: 120,
      deltaX: 0,
      cancelable: true,
    })
    div.dispatchEvent(wheelEvent)

    expect(div.scrollLeft).toBe(120)
    expect(wheelEvent.defaultPrevented).toBe(true)

    // Reverse wheel
    const wheelBack = new WheelEvent('wheel', {
      deltaY: -50,
      deltaX: 0,
      cancelable: true,
    })
    div.dispatchEvent(wheelBack)
    expect(div.scrollLeft).toBe(70)
  })

  it('translates mouse drag to horizontal scrollLeft and suppresses click', () => {
    const [el, setEl] = createSignal<HTMLDivElement>()
    const div = document.createElement('div')
    div.scrollLeft = 100
    setEl(div)

    createHorizontalScrollDrag(el, { draggingClass: 'isDragging' })

    const pointerDown = new PointerEvent('pointerdown', {
      pointerType: 'mouse',
      button: 0,
      clientX: 200,
    })
    div.dispatchEvent(pointerDown)

    // Small move within threshold (<= 4) doesn't drag
    const smallMove = new PointerEvent('pointermove', {
      pointerType: 'mouse',
      clientX: 202,
    })
    div.dispatchEvent(smallMove)
    expect(div.classList.contains('isDragging')).toBe(false)
    expect(div.scrollLeft).toBe(100)

    // Move past threshold (> 4)
    const largeMove = new PointerEvent('pointermove', {
      pointerType: 'mouse',
      clientX: 150, // moved 50px left => scrollLeft increases by 50
    })
    div.dispatchEvent(largeMove)
    expect(div.classList.contains('isDragging')).toBe(true)
    expect(div.scrollLeft).toBe(150)

    // Pointer up
    const pointerUp = new PointerEvent('pointerup', {
      pointerType: 'mouse',
    })
    div.dispatchEvent(pointerUp)
    expect(div.classList.contains('isDragging')).toBe(false)

    // Click event should be suppressed after drag
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    })
    div.dispatchEvent(clickEvent)
    expect(clickEvent.defaultPrevented).toBe(true)
  })

  it('allows click event when pointer was not dragged', () => {
    const [el, setEl] = createSignal<HTMLDivElement>()
    const div = document.createElement('div')
    setEl(div)

    createHorizontalScrollDrag(el)

    div.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerType: 'mouse',
        button: 0,
        clientX: 100,
      }),
    )
    div.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerType: 'mouse',
      }),
    )

    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    })
    div.dispatchEvent(clickEvent)
    expect(clickEvent.defaultPrevented).toBe(false)
  })

  it('ignores touch pointers to preserve native mobile gesture handling', () => {
    const [el, setEl] = createSignal<HTMLDivElement>()
    const div = document.createElement('div')
    div.scrollLeft = 0
    setEl(div)

    createHorizontalScrollDrag(el, { draggingClass: 'isDragging' })

    div.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerType: 'touch',
        button: 0,
        clientX: 200,
      }),
    )
    div.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerType: 'touch',
        clientX: 100,
      }),
    )

    // Native touch should not alter scrollLeft via this handler
    expect(div.scrollLeft).toBe(0)
    expect(div.classList.contains('isDragging')).toBe(false)
  })

  it('bypasses wheel scrolling and drag when event occurs over interactive input', () => {
    const [el, setEl] = createSignal<HTMLDivElement>()
    const div = document.createElement('div')
    div.scrollLeft = 0

    const input = document.createElement('input')
    input.type = 'text'
    div.appendChild(input)

    const scrubLabel = document.createElement('label')
    scrubLabel.setAttribute('data-step', '1')
    div.appendChild(scrubLabel)

    setEl(div)
    createHorizontalScrollDrag(el, { draggingClass: 'isDragging' })

    // Wheel event targeted on input should not modify scrollLeft or preventDefault
    const inputWheel = new WheelEvent('wheel', {
      deltaY: 100,
      cancelable: true,
      bubbles: true,
    })
    input.dispatchEvent(inputWheel)
    expect(div.scrollLeft).toBe(0)
    expect(inputWheel.defaultPrevented).toBe(false)

    // Wheel event targeted on scrubLabel should also not modify scrollLeft
    const scrubWheel = new WheelEvent('wheel', {
      deltaY: 100,
      cancelable: true,
      bubbles: true,
    })
    scrubLabel.dispatchEvent(scrubWheel)
    expect(div.scrollLeft).toBe(0)
    expect(scrubWheel.defaultPrevented).toBe(false)

    // Pointer down on input should not initiate dragging
    input.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerType: 'mouse',
        button: 0,
        clientX: 100,
        bubbles: true,
      }),
    )
    div.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerType: 'mouse',
        clientX: 50,
      }),
    )
    expect(div.scrollLeft).toBe(0)
    expect(div.classList.contains('isDragging')).toBe(false)
  })
})
