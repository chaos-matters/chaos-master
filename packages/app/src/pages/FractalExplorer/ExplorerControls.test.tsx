/**
 * The settings panel. Its number fields scrub when dragged sideways: c by a
 * thousandth per pixel, the iteration limit doubling every 100 px, and each
 * keeps its typed-entry behaviour too. Past the fields: which controls each
 * mode shows, the iteration stepper's ends, and the status line.
 */
import { DEFAULT_LOCATION, MAX_ITERATIONS, MIN_ITERATIONS, } from '@chaos-master/core'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExplorerControls } from './ExplorerControls'
import type { ExplorerControlsProps } from './ExplorerControls'
import type { ExplorerStatus } from './ExplorerRenderer'
import type { Palette } from '@/flame/colorMap'

// The palette picker loads palette files; a button stands in for it here.
vi.mock('@/components/PaletteSelector/PaletteSelector', () => ({
  PaletteSelector: (props: {
    selectedPaletteId: string
    onSelect: (palette: { id: string }) => void
  }) => (
    <button
      type="button"
      data-selected={props.selectedPaletteId}
      onClick={() => {
        props.onSelect({ id: 'grayscale' })
      }}
    >
      Pick a palette
    </button>
  ),
}))

afterEach(() => {
  cleanup()
})

function renderControls(overrides: Partial<ExplorerControlsProps> = {}) {
  const props: ExplorerControlsProps = {
    location: { ...DEFAULT_LOCATION, kind: 'julia' },
    mode: 'julia',
    status: undefined,
    palette: {
      id: 'plasma',
      name: 'Plasma',
      entries: [],
    } as unknown as Palette,
    period: 64,
    phase: 0,
    relief: 0.5,
    quality: 'balanced',
    onMode: vi.fn(),
    onJuliaC: vi.fn(),
    onJuliaHere: vi.fn(),
    onIterations: vi.fn(),
    onPalette: vi.fn(),
    onPeriod: vi.fn(),
    onPhase: vi.fn(),
    onRelief: vi.fn(),
    onQuality: vi.fn(),
    onHome: vi.fn(),
    onCopyLink: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  }
  render(() => <ExplorerControls {...props} />)
  return props
}

function dragSideways(field: HTMLElement, dx: number, shiftKey = false) {
  const init = { pointerId: 5, pointerType: 'mouse', button: 0, bubbles: true }
  field.dispatchEvent(
    new PointerEvent('pointerdown', { ...init, clientX: 200 }),
  )
  document.dispatchEvent(
    new PointerEvent('pointermove', { ...init, clientX: 200 + dx, shiftKey }),
  )
  document.dispatchEvent(
    new PointerEvent('pointerup', { ...init, clientX: 200 + dx }),
  )
}

describe('ExplorerControls number fields', () => {
  it('scrubs c by a thousandth per pixel', () => {
    const props = renderControls()
    dragSideways(screen.getByLabelText('c, real'), 20)
    expect(props.onJuliaC).toHaveBeenLastCalledWith({
      re: '-0.78',
      im: DEFAULT_LOCATION.juliaC.im,
    })
    dragSideways(screen.getByLabelText('c, imaginary'), -10, true)
    expect(props.onJuliaC).toHaveBeenLastCalledWith({
      re: DEFAULT_LOCATION.juliaC.re,
      im: '0.155',
    })
  })

  it('doubles the iteration limit every 100 px', () => {
    const props = renderControls()
    dragSideways(screen.getByLabelText('Iteration limit'), 100)
    expect(props.onIterations).toHaveBeenLastCalledWith(2000)
    dragSideways(screen.getByLabelText('Iteration limit'), -100)
    expect(props.onIterations).toHaveBeenLastCalledWith(500)
  })

  it('still commits a typed c, and ignores one that does not parse', () => {
    const props = renderControls()
    const field = screen.getByLabelText('c, real')
    fireEvent.input(field, { target: { value: '0.285' } })
    fireEvent.change(field)
    expect(props.onJuliaC).toHaveBeenLastCalledWith({
      re: '0.285',
      im: DEFAULT_LOCATION.juliaC.im,
    })
    fireEvent.input(field, { target: { value: '0.2.8' } })
    fireEvent.change(field)
    expect(props.onJuliaC).toHaveBeenCalledOnce()
  })

  it('puts back an iteration limit that is emptied, as it does one that does not parse', () => {
    const props = renderControls()
    const field = screen.getByLabelText<HTMLInputElement>('Iteration limit')
    for (const text of ['', '   ', 'abc']) {
      field.value = text
      fireEvent.change(field)
      expect(field.value).toBe('1000')
    }
    expect(props.onIterations).not.toHaveBeenCalled()
  })
})

describe('ExplorerControls iteration limit', () => {
  it('halves and doubles the limit', () => {
    const props = renderControls()
    fireEvent.click(screen.getByLabelText('Halve the iteration limit'))
    expect(props.onIterations).toHaveBeenLastCalledWith(500)
    fireEvent.click(screen.getByLabelText('Double the iteration limit'))
    expect(props.onIterations).toHaveBeenLastCalledWith(2000)
  })

  it.each([
    [MIN_ITERATIONS, 'Halve the iteration limit'],
    [MAX_ITERATIONS, 'Double the iteration limit'],
  ])('stays at %i past that end', (limit, button) => {
    const props = renderControls({
      location: { ...DEFAULT_LOCATION, maxIterations: limit },
    })
    fireEvent.click(screen.getByLabelText(button))
    expect(props.onIterations).toHaveBeenCalledExactlyOnceWith(limit)
  })

  it('asks for nothing when dragged on past the top', () => {
    const props = renderControls({
      location: { ...DEFAULT_LOCATION, maxIterations: MAX_ITERATIONS },
    })
    dragSideways(screen.getByLabelText('Iteration limit'), 100)
    expect(props.onIterations).not.toHaveBeenCalled()
  })

  it.each([
    ['1e6', 1_000_000],
    [' 2500 ', 2500],
    ['3', MIN_ITERATIONS],
    ['9e9', MAX_ITERATIONS],
    ['123.6', 124],
  ])('commits a typed %j as %i', (text, limit) => {
    const props = renderControls()
    const field = screen.getByLabelText<HTMLInputElement>('Iteration limit')
    field.value = text
    fireEvent.change(field)
    expect(props.onIterations).toHaveBeenCalledExactlyOnceWith(limit)
  })
})

describe('ExplorerControls by mode', () => {
  const C_FIELDS = ['c, real', 'c, imaginary']

  it('shows the Mandelbrot set no c, and offers the Julia set of the centre', () => {
    const props = renderControls({
      location: DEFAULT_LOCATION,
      mode: 'mandelbrot',
    })
    for (const label of C_FIELDS) {
      expect(screen.queryByLabelText(label)).toBeNull()
    }
    fireEvent.click(screen.getByText('Julia set of the view centre'))
    expect(props.onJuliaHere).toHaveBeenCalledOnce()
    expect(screen.queryByText(/Drag the ring/)).toBeNull()
  })

  it('shows the Julia set its c, and nothing to take c from', () => {
    renderControls()
    for (const label of C_FIELDS) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
    expect(screen.queryByText(/view centre/)).toBeNull()
  })

  it('shows the split its c, the point to move, and how to drag it', () => {
    const props = renderControls({
      location: { ...DEFAULT_LOCATION, split: true },
      mode: 'split',
    })
    for (const label of C_FIELDS) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
    fireEvent.click(screen.getByText('Move the point to the view centre'))
    expect(props.onJuliaHere).toHaveBeenCalledOnce()
    expect(screen.getByText(/Drag the ring on the Mandelbrot set/)).toBeTruthy()
  })

  it.each(['mandelbrot', 'julia', 'split'] as const)(
    'checks the %s radio only',
    (mode) => {
      renderControls({ mode })
      const radios = screen.getAllByRole('radio', { checked: true })
      expect(radios.map((r) => r.textContent)).toEqual([
        { mandelbrot: 'Mandelbrot', julia: 'Julia', split: 'Both' }[mode],
        'Balanced',
      ])
    },
  )

  it('asks for the mode and the quality chosen', () => {
    const props = renderControls()
    fireEvent.click(screen.getByRole('radio', { name: 'Both' }))
    expect(props.onMode).toHaveBeenLastCalledWith('split')
    fireEvent.click(screen.getByRole('radio', { name: 'Sharp' }))
    expect(props.onQuality).toHaveBeenLastCalledWith('sharp')
  })

  it('marks a c that does not parse as invalid while it is typed', () => {
    renderControls()
    const field = screen.getByLabelText('c, real')
    expect(field.getAttribute('aria-invalid')).toBe('false')
    fireEvent.input(field, { target: { value: '0.2.8' } })
    expect(field.getAttribute('aria-invalid')).toBe('true')
  })
})

describe('ExplorerControls colouring and actions', () => {
  // A slider's name is its label and its value, both inside the <label>.
  const slider = (label: string) =>
    screen.getByRole('slider', { name: (name) => name.startsWith(label) })

  it('sets the colour cycle in doublings, the shift and the relief', () => {
    const props = renderControls()
    const cycle = slider('Colour cycle')
    expect(cycle.getAttribute('aria-valuetext')).toBe('64')
    fireEvent.input(cycle, { target: { value: '5' } })
    expect(props.onPeriod).toHaveBeenLastCalledWith(32)
    fireEvent.input(slider('Colour shift'), { target: { value: '0.25' } })
    expect(props.onPhase).toHaveBeenLastCalledWith(0.25)
    fireEvent.input(slider('Relief'), { target: { value: '0.3' } })
    expect(props.onRelief).toHaveBeenLastCalledWith(0.3)
  })

  it('shows the palette in use, and hands on the one picked', () => {
    const props = renderControls()
    const picker = screen.getByText('Pick a palette')
    expect(picker.dataset.selected).toBe('plasma')
    fireEvent.click(picker)
    expect(props.onPalette).toHaveBeenCalledExactlyOnceWith({ id: 'grayscale' })
  })

  it('runs each view action', () => {
    const props = renderControls()
    fireEvent.click(screen.getByText('Home'))
    fireEvent.click(screen.getByText('Copy link'))
    fireEvent.click(screen.getByText('Save PNG'))
    expect(props.onHome).toHaveBeenCalledOnce()
    expect(props.onCopyLink).toHaveBeenCalledOnce()
    expect(props.onSave).toHaveBeenCalledOnce()
  })
})

describe('ExplorerControls status line', () => {
  const FINISHED: ExplorerStatus = {
    progress: 1,
    orbitPending: false,
    orbitProgress: 1,
    orbitMs: undefined,
    grid: { width: 1280, height: 720 },
    stepBudget: 64,
    samples: 1,
    sampleTarget: 1,
    iterationCap: undefined,
    error: undefined,
  }

  it.each([
    [undefined, 'Starting the GPU'],
    [{ ...FINISHED, error: 'device lost' }, 'Error: device lost'],
    [
      { ...FINISHED, orbitPending: true, orbitProgress: 0.429 },
      'Computing the reference orbit, 42%',
    ],
    [FINISHED, '1280 x 720 px, 64 steps per frame'],
    [
      { ...FINISHED, samples: 3, sampleTarget: 8, orbitMs: 12.4 },
      '1280 x 720 px, 64 steps per frame, 3 of 8 samples, reference in 12 ms',
    ],
    [
      { ...FINISHED, iterationCap: 500_000 },
      '1280 x 720 px, 64 steps per frame. This GPU holds orbits of 500000 iterations at most',
    ],
  ])('reads %o as %j', (status, line) => {
    renderControls({ status })
    expect(screen.getByText(line).tagName).toBe('P')
  })
})
