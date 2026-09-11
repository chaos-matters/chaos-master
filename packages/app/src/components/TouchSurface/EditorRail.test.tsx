import '@/commands/builtins'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { PEEK_HEIGHT, SHEET_TRANSITION_MS } from './detents'
import { EditorRail } from './EditorRail'

const impactLight = vi.fn()
const impactMedium = vi.fn()
const selectionChanged = vi.fn()
const selectionStart = vi.fn()
const selectionEnd = vi.fn()
vi.mock('@/lib/haptics', () => ({
  haptic: {
    impactLight: () => impactLight(),
    impactMedium: () => impactMedium(),
    selectionChanged: () => selectionChanged(),
    success: () => undefined,
    warning: () => undefined,
    error: () => undefined,
    selectionStart: () => selectionStart(),
    selectionEnd: () => selectionEnd(),
  },
}))

function mount(extra: Partial<Parameters<typeof EditorRail>[0]> = {}) {
  const ctx = createMockCommandContext()
  const props = {
    ctx,
    flame: ctx.flameDescriptor,
    onRandomize: vi.fn(),
    onMutate: vi.fn(),
    onQuickExport: vi.fn(),
    onOpenExportOptions: vi.fn(),
    onCoveredHeightChange: vi.fn(),
    ...extra,
  }
  const { unmount } = render(() => <EditorRail {...props} />)
  return { ...props, unmount }
}

const sheet = () => screen.getByTestId('editor-rail-sheet')

/** Pointer events carry the moment the input happened; fireEvent cannot set it. */
function pointerAt(type: string, clientY: number, timeStamp: number) {
  const event = new window.PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientY,
    pointerId: 1,
  })
  Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  return event
}

describe('EditorRail', () => {
  beforeEach(() => {
    window.innerHeight = 852
    window.dispatchEvent(new Event('resize'))
    impactLight.mockClear()
    impactMedium.mockClear()
    selectionChanged.mockClear()
    selectionStart.mockClear()
    selectionEnd.mockClear()
  })
  afterEach(cleanup)

  it('starts at peek with four chips and the shutter', () => {
    mount()
    expect(sheet().style.height).toBe(`${PEEK_HEIGHT}px`)
    expect(
      screen.getAllByRole('tab').map((t) => t.textContent?.trim()),
    ).toEqual(['Variations', 'Shape', 'Colour', 'Vary'])
    expect(screen.getByRole('button', { name: 'Save image' })).toBeTruthy()
  })

  it('opens to medium on a chip tap and back to peek on the same chip', () => {
    const props = mount()
    const shape = screen.getByRole('tab', { name: 'Shape' })
    fireEvent.pointerDown(shape)
    fireEvent.click(shape)
    expect(sheet().style.height).toBe('375px')
    expect(shape.getAttribute('aria-selected')).toBe('true')
    expect(impactLight).toHaveBeenCalledTimes(2) // touch-down, then the latch
    expect(props.onCoveredHeightChange).toHaveBeenLastCalledWith(
      375 - PEEK_HEIGHT,
    )
    fireEvent.click(shape)
    expect(sheet().style.height).toBe(`${PEEK_HEIGHT}px`)
    expect(props.onCoveredHeightChange).toHaveBeenLastCalledWith(0)
  })

  it('switches panels without changing the detent', () => {
    mount()
    fireEvent.click(screen.getByRole('tab', { name: 'Shape' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Colour' }))
    expect(sheet().style.height).toBe('375px')
    expect(
      screen.getByRole('tab', { name: 'Colour' }).getAttribute('aria-selected'),
    ).toBe('true')
  })

  it('follows a drag and settles by velocity, never below peek', () => {
    mount()
    const grabber = screen.getByTestId('editor-rail-grabber')
    fireEvent.pointerDown(grabber, { clientY: 800, pointerId: 1 })
    fireEvent.pointerMove(grabber, { clientY: 700, pointerId: 1 })
    expect(sheet().style.height).toBe(`${PEEK_HEIGHT + 100}px`)
    fireEvent.pointerUp(grabber, { clientY: 700, pointerId: 1 })
    expect(['96px', '375px']).toContain(sheet().style.height)
    fireEvent.pointerDown(grabber, { clientY: 500, pointerId: 1 })
    fireEvent.pointerMove(grabber, { clientY: 900, pointerId: 1 })
    fireEvent.pointerUp(grabber, { clientY: 900, pointerId: 1 })
    expect(sheet().style.height).toBe(`${PEEK_HEIGHT}px`)
  })

  it('fills the sheet while a drag from peek grows it', () => {
    mount()
    const grabber = screen.getByTestId('editor-rail-grabber')
    fireEvent.pointerDown(grabber, { clientY: 800, pointerId: 1 })
    fireEvent.pointerMove(grabber, { clientY: 700, pointerId: 1 })
    // Growing an empty sheet and filling it on release reads as a pop.
    const body = screen.getByTestId('editor-rail-body')
    expect(body.hidden).toBe(false)
  })

  it('keeps the panel mounted, and hides it once the sheet has shrunk', () => {
    vi.useFakeTimers()
    mount()
    const shape = screen.getByRole('tab', { name: 'Shape' })
    fireEvent.click(shape)
    const body = screen.getByTestId('editor-rail-body')
    expect(body.hidden).toBe(false)

    fireEvent.click(shape)
    // The sheet is still shrinking; emptying it now shows bare glass.
    expect(body.hidden).toBe(false)
    vi.advanceTimersByTime(SHEET_TRANSITION_MS + 1)
    expect(body.hidden).toBe(true)

    // Reopening reuses the same panel: every variation preview would
    // otherwise build its WebGPU context and its snapshot again.
    fireEvent.click(shape)
    expect(screen.getByTestId('editor-rail-body')).toBe(body)
    expect(body.hidden).toBe(false)
    vi.useRealTimers()
  })

  it('keeps the panel up when the keyboard shrinks the viewport', () => {
    vi.useFakeTimers()
    mount()
    fireEvent.click(screen.getByRole('tab', { name: 'Variations' }))
    const body = screen.getByTestId('editor-rail-body')
    expect(body.hidden).toBe(false)

    // A landscape phone with the keyboard open: 180px of visual viewport, so
    // medium floors onto peek although the sheet is still at medium. Hiding
    // the panel here takes the focus out of the field the keyboard was
    // opened for, which closes the keyboard and grows the viewport back.
    window.innerHeight = 180
    window.dispatchEvent(new Event('resize'))
    vi.advanceTimersByTime(SHEET_TRANSITION_MS + 1)
    expect(sheet().style.height).toBe(`${PEEK_HEIGHT}px`)
    expect(sheet().dataset['detent']).toBe('medium')
    expect(body.hidden).toBe(false)
    vi.useRealTimers()
  })

  it('waits for the focus to leave the panel before hiding it', () => {
    vi.useFakeTimers()
    mount()
    const vary = screen.getByRole('tab', { name: 'Vary' })
    fireEvent.click(vary)
    const body = screen.getByTestId('editor-rail-body')
    const inside = screen.getByRole('button', { name: 'Randomize' })
    inside.focus()
    fireEvent.focusIn(body)

    // Hiding the panel under the focus is what closes the keyboard, so the
    // sheet collapses without it and the panel follows once the focus goes.
    fireEvent.click(vary)
    vi.advanceTimersByTime(SHEET_TRANSITION_MS + 1)
    expect(body.hidden).toBe(false)

    inside.blur()
    fireEvent.focusOut(body)
    vi.advanceTimersByTime(SHEET_TRANSITION_MS + 1)
    expect(body.hidden).toBe(true)
    vi.useRealTimers()
  })

  it('settles a flick, and drops it once the finger has rested', () => {
    mount()
    const grabber = screen.getByTestId('editor-rail-grabber')

    // 50px in 16ms: a flick, and it goes one detent up from 146.
    grabber.dispatchEvent(pointerAt('pointerdown', 800, 0))
    grabber.dispatchEvent(pointerAt('pointermove', 750, 16))
    grabber.dispatchEvent(pointerAt('pointerup', 750, 32))
    expect(sheet().style.height).toBe('375px')

    // The same movement, but the finger rests on the sheet for a second and
    // a half before it lifts. That is a placement, not a flick: the sheet
    // settles at the detent nearest where it stands.
    fireEvent.click(screen.getByRole('tab', { name: 'Shape' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Shape' }))
    expect(sheet().style.height).toBe(`${PEEK_HEIGHT}px`)
    grabber.dispatchEvent(pointerAt('pointerdown', 800, 1000))
    grabber.dispatchEvent(pointerAt('pointermove', 750, 1016))
    grabber.dispatchEvent(pointerAt('pointerup', 750, 2516))
    expect(sheet().style.height).toBe(`${PEEK_HEIGHT}px`)
  })

  it('starts a drag from the height on screen, not the one it is opening to', () => {
    mount()
    const el = sheet()
    // The sheet is part-way through its 280ms opening when the finger lands.
    el.getBoundingClientRect = () => ({ height: 200 }) as DOMRect
    fireEvent.click(screen.getByRole('tab', { name: 'Shape' }))

    const grabber = screen.getByTestId('editor-rail-grabber')
    fireEvent.pointerDown(grabber, { clientY: 500, pointerId: 1 })
    fireEvent.pointerMove(grabber, { clientY: 450, pointerId: 1 })
    expect(sheet().style.height).toBe('250px')
  })

  it('freezes the sheet where it stands as the finger lands', () => {
    mount()
    const el = sheet()
    // The sheet is part-way through its 280ms opening when the finger lands.
    el.getBoundingClientRect = () => ({ height: 200 }) as DOMRect
    fireEvent.click(screen.getByRole('tab', { name: 'Shape' }))
    expect(el.style.height).toBe('375px')

    // The transition stops here, not at the first move: it would otherwise
    // keep travelling under the finger and jump by the distance it covered.
    const grabber = screen.getByTestId('editor-rail-grabber')
    fireEvent.pointerDown(grabber, { clientY: 500, pointerId: 1 })
    expect(el.style.height).toBe('200px')
    expect(el.classList.contains('dragging')).toBe(true)
  })

  it('leaves the detent alone when the grabber is tapped, not dragged', () => {
    mount()
    const el = sheet()
    el.getBoundingClientRect = () => ({ height: 200 }) as DOMRect
    fireEvent.click(screen.getByRole('tab', { name: 'Shape' }))

    const grabber = screen.getByTestId('editor-rail-grabber')
    fireEvent.pointerDown(grabber, { clientY: 500, pointerId: 1 })
    fireEvent.pointerUp(grabber, { clientY: 500, pointerId: 1 })
    // Nothing moved, so the sheet keeps going where it was going; settling
    // from the frozen height would send a half-open sheet back to peek.
    expect(el.style.height).toBe('375px')
    expect(el.dataset['detent']).toBe('medium')
  })

  it('brackets the drag with a selection start and end', () => {
    mount()
    const grabber = screen.getByTestId('editor-rail-grabber')
    // Both plugins drop selectionChanged until a generator is prepared, so
    // the detent ticks are silent without the pair around them.
    fireEvent.pointerDown(grabber, { clientY: 800, pointerId: 1 })
    expect(selectionStart).toHaveBeenCalledTimes(1)
    expect(selectionEnd).not.toHaveBeenCalled()
    fireEvent.pointerMove(grabber, { clientY: 500, pointerId: 1 })
    expect(selectionChanged).toHaveBeenCalled()
    fireEvent.pointerUp(grabber, { clientY: 500, pointerId: 1 })
    expect(selectionEnd).toHaveBeenCalledTimes(1)
  })

  it('lets the sheet go when a second finger lands', () => {
    mount()
    const grabber = screen.getByTestId('editor-rail-grabber')
    fireEvent.pointerDown(grabber, { clientY: 800, pointerId: 1 })
    fireEvent.pointerMove(grabber, { clientY: 700, pointerId: 1 })
    expect(sheet().style.height).toBe(`${PEEK_HEIGHT + 100}px`)

    // A pinch begins on the sheet. Tracking two fingers against one start
    // point walks the sheet around, so the drag ends where it stands.
    const second = new window.TouchEvent('touchstart', { bubbles: true })
    Object.defineProperty(second, 'touches', { value: [{}, {}] })
    document.dispatchEvent(second)
    const settled = sheet().style.height
    expect(settled).not.toBe(`${PEEK_HEIGHT + 100}px`)

    fireEvent.pointerMove(grabber, { clientY: 400, pointerId: 2 })
    expect(sheet().style.height).toBe(settled)
  })

  it('keeps the large detent clear of the top bar', () => {
    mount()
    // happy-dom applies no stylesheet, so the dock's padding is written here
    // as an iPhone 15 resolves it: the top bar's bottom plus the 8px gap
    // above the sheet, and the home indicator below it.
    const dock = screen.getByRole('region', { name: 'Editor controls' })
    dock.style.paddingTop = '119px'
    dock.style.paddingBottom = '42px'
    window.dispatchEvent(new Event('resize'))

    const grabber = screen.getByTestId('editor-rail-grabber')
    fireEvent.pointerDown(grabber, { clientY: 800, pointerId: 1 })
    fireEvent.pointerMove(grabber, { clientY: 0, pointerId: 1 })
    expect(sheet().style.height).toBe('691px')
    fireEvent.pointerUp(grabber, { clientY: 0, pointerId: 1 })
    expect(sheet().style.height).toBe('691px')
  })

  it('fires the shutter on tap and export options on a long press', () => {
    vi.useFakeTimers()
    const props = mount()
    const shutter = screen.getByRole('button', { name: 'Save image' })
    fireEvent.pointerDown(shutter)
    fireEvent.pointerUp(shutter)
    fireEvent.click(shutter)
    expect(props.onQuickExport).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(shutter)
    vi.advanceTimersByTime(600)
    fireEvent.pointerUp(shutter)
    fireEvent.click(shutter)
    expect(props.onOpenExportOptions).toHaveBeenCalledTimes(1)
    expect(props.onQuickExport).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('re-reports the covered height when the viewport changes', () => {
    const props = mount()
    fireEvent.click(screen.getByRole('tab', { name: 'Shape' }))
    expect(props.onCoveredHeightChange).toHaveBeenLastCalledWith(
      375 - PEEK_HEIGHT,
    )
    // The phone is rotated: medium is 173 now, so the canvas must pan back.
    window.innerHeight = 393
    window.dispatchEvent(new Event('resize'))
    expect(props.onCoveredHeightChange).toHaveBeenLastCalledWith(
      173 - PEEK_HEIGHT,
    )
  })

  it('gives the canvas back when it unmounts', () => {
    const props = mount()
    fireEvent.click(screen.getByRole('tab', { name: 'Shape' }))
    expect(props.onCoveredHeightChange).toHaveBeenLastCalledWith(
      375 - PEEK_HEIGHT,
    )
    props.unmount()
    expect(props.onCoveredHeightChange).toHaveBeenLastCalledWith(0)
  })

  it('reaches Mutate and Randomize through the Vary chip', () => {
    const props = mount()
    fireEvent.click(screen.getByRole('tab', { name: 'Vary' }))
    // A real tap is a pointerdown then a click; the haptic rides the first.
    const randomize = screen.getByRole('button', { name: 'Randomize' })
    fireEvent.pointerDown(randomize)
    fireEvent.click(randomize)
    const mutate = screen.getByRole('button', { name: 'Mutate' })
    fireEvent.pointerDown(mutate)
    fireEvent.click(mutate)
    expect(props.onRandomize).toHaveBeenCalledTimes(1)
    expect(props.onMutate).toHaveBeenCalledTimes(1)
    expect(impactMedium).toHaveBeenCalledTimes(1)
  })
})
