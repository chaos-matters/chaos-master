/**
 * The explorer page with its GPU parts stood in for: the renderers and the
 * Julia point become stubs that record what the page hands them, so the page's
 * own state can be driven and read without a device.
 */
import { DEFAULT_LOCATION, formatExplorerHash, JULIA_HOME, MANDELBROT_HOME, } from '@chaos-master/core'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createEffect } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addCustomPalette, paletteEntry } from '@/flame/colorMap'
import { withMode } from './explorerModes'
import { resolvePalette } from './explorerPalette'
import { FractalExplorerPage } from './FractalExplorerPage'
import type { ExplorerLocation } from '@chaos-master/core'
import type { ParentProps } from 'solid-js'
import type * as PaletteModule from './explorerPalette'
import type { ExplorerRendererProps, ExplorerStatus } from './ExplorerRenderer'
import type * as JuliaMarkerModule from './JuliaMarker'
import type { JuliaMarkerProps } from './JuliaMarker'
import type { Palette } from '@/flame/colorMap'

const stubs = vi.hoisted(() => ({
  renderers: [] as ExplorerRendererProps[],
  markers: [] as JuliaMarkerProps[],
  /** Runs of the stand-in for each renderer's palette upload. */
  paletteUploads: 0,
  /** The palette picker's choice, as the settings panel wires it. */
  selectPalette: undefined as ((palette: Palette) => void) | undefined,
  showToast: vi.fn(),
}))

vi.mock('./ExplorerRenderer', () => ({
  ExplorerRenderer: (props: ExplorerRendererProps) => {
    stubs.renderers.push(props)
    // The real renderer uploads the palette and marks the colours changed
    // whenever this re-runs, which drops a finished picture's supersamples.
    createEffect(() => {
      props.palette()
      stubs.paletteUploads += 1
    })
    return null
  },
}))

vi.mock('./JuliaMarker', async (importOriginal) => ({
  ...(await importOriginal<typeof JuliaMarkerModule>()),
  JuliaMarker: (props: JuliaMarkerProps) => {
    stubs.markers.push(props)
    return null
  },
}))

vi.mock('./explorerPalette', async (importOriginal) => {
  const actual = await importOriginal<typeof PaletteModule>()
  return { ...actual, resolvePalette: vi.fn(actual.resolvePalette) }
})

vi.mock('@/lib/AutoCanvas', () => ({
  AutoCanvas: (props: ParentProps) => <div>{props.children}</div>,
}))

vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: stubs.showToast }),
}))

// The palette picker loads palette files; it is not what these tests are about.
vi.mock('@/components/PaletteSelector/PaletteSelector', () => ({
  PaletteSelector: (props: { onSelect: (palette: Palette) => void }) => {
    stubs.selectPalette = props.onSelect
    return null
  },
}))

// The test runner's own localStorage is not a working Storage.
const stored = new Map<string, string>()
const memoryStorage: Storage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => {
    stored.set(key, value)
  },
  removeItem: (key) => {
    stored.delete(key)
  },
  clear: () => {
    stored.clear()
  },
  key: (index) => [...stored.keys()][index] ?? null,
  get length() {
    return stored.size
  },
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage)
  stubs.renderers.length = 0
  stubs.markers.length = 0
  stubs.paletteUploads = 0
  stubs.showToast.mockClear()
  vi.mocked(resolvePalette).mockClear()
})

afterEach(() => {
  cleanup()
  stored.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

/** The page, opened at a link to `location`. */
function open(location: ExplorerLocation) {
  window.history.replaceState(
    null,
    '',
    `/explore${formatExplorerHash(location)}`,
  )
  render(() => <FractalExplorerPage />)
  // The panel starts open on a wide screen only.
  const show = screen.queryByRole('button', { name: 'Show settings' })
  if (show) fireEvent.click(show)
}

/** The fragment once the page's debounced write has landed. */
function writtenHash(): string {
  vi.advanceTimersByTime(1000)
  return window.location.hash
}

describe('FractalExplorerPage palette', () => {
  function saveCustom() {
    return addCustomPalette({
      name: 'Mine',
      entries: [paletteEntry(0, 0.1, 0.1), paletteEntry(1, -0.1, 0)],
      source: 'custom',
    })
  }

  /** The split view's two renderers and its point. */
  function splitStubs() {
    const [mandelbrot, julia] = stubs.renderers
    const marker = stubs.markers[0]
    if (!mandelbrot || !julia || !marker) throw new Error('split not shown')
    return { mandelbrot, julia, marker }
  }

  it('keeps a linked custom palette as one object while c moves and the panes pan', () => {
    const saved = saveCustom()
    open({ ...DEFAULT_LOCATION, split: true, paletteId: saved.id })
    const { mandelbrot, julia, marker } = splitStubs()
    const first = mandelbrot.palette()
    expect(first.id).toBe(saved.id)
    const uploads = stubs.paletteUploads

    for (let i = 1; i <= 10; i += 1) {
      marker.setPoint({ re: String(-0.8 + i / 1000), im: '0.156' })
    }
    mandelbrot.setView({ ...DEFAULT_LOCATION.view, zoomLog2: 3 })
    julia.setView({ ...DEFAULT_LOCATION.juliaView, zoomLog2: 3 })

    expect(mandelbrot.palette()).toBe(first)
    expect(julia.palette()).toBe(first)
    expect(stubs.paletteUploads).toBe(uploads)
    expect(resolvePalette).toHaveBeenCalledOnce()
  })

  it('recolours each pane once for a palette picked over a custom one', () => {
    const saved = saveCustom()
    open({ ...DEFAULT_LOCATION, split: true, paletteId: saved.id })
    const { mandelbrot, julia } = splitStubs()
    const grey = resolvePalette('grayscale', undefined)
    const uploads = stubs.paletteUploads

    stubs.selectPalette?.(grey)

    expect(mandelbrot.palette()).toBe(grey)
    expect(julia.palette()).toBe(grey)
    expect(stubs.paletteUploads - uploads).toBe(2)
  })

  it('still follows a link to another palette', () => {
    const saved = saveCustom()
    open({ ...DEFAULT_LOCATION, split: true, paletteId: saved.id })
    const { mandelbrot, julia } = splitStubs()

    const linked = { ...DEFAULT_LOCATION, split: true, paletteId: 'grayscale' }
    window.history.replaceState(
      null,
      '',
      `/explore${formatExplorerHash(linked)}`,
    )
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    expect(mandelbrot.palette().id).toBe('grayscale')
    expect(julia.palette().id).toBe('grayscale')
  })
})

describe('FractalExplorerPage modes', () => {
  const DEEP = { centerRe: '-0.7436', centerIm: '0.1318', zoomLog2: 12 }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('opens the split from the header, and writes it to the link', () => {
    open(DEFAULT_LOCATION)
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Show the Julia set of a point beside the Mandelbrot set',
      }),
    )
    const julia = stubs.renderers[1]
    expect(julia?.scene()).toMatchObject({ kind: 'julia', view: JULIA_HOME })
    expect(writtenHash()).toBe(
      formatExplorerHash(withMode(DEFAULT_LOCATION, 'split')),
    )
  })

  it('switches the fractal from the panel, and writes it to the link', () => {
    open(DEFAULT_LOCATION)
    fireEvent.click(screen.getByRole('radio', { name: 'Julia' }))
    expect(stubs.renderers[0]?.scene()).toMatchObject({
      kind: 'julia',
      view: JULIA_HOME,
    })
    expect(writtenHash()).toBe(
      formatExplorerHash(withMode(DEFAULT_LOCATION, 'julia')),
    )
  })

  it('leaves the picture alone when the mode it shows is picked', () => {
    open(DEFAULT_LOCATION)
    const scene = stubs.renderers[0]?.scene()
    fireEvent.click(screen.getByRole('radio', { name: 'Mandelbrot' }))
    expect(stubs.renderers[0]?.scene()).toBe(scene)
    expect(writtenHash()).toBe(formatExplorerHash(DEFAULT_LOCATION))
  })

  it('opens the Julia set of the view centre, and goes home', () => {
    open({ ...DEFAULT_LOCATION, view: DEEP })
    const main = stubs.renderers[0]
    fireEvent.click(screen.getByText('Julia set of the view centre'))
    expect(main?.scene()).toEqual({
      kind: 'julia',
      view: JULIA_HOME,
      juliaC: { re: DEEP.centerRe, im: DEEP.centerIm },
      maxIterations: DEFAULT_LOCATION.maxIterations,
    })
    fireEvent.click(screen.getByRole('radio', { name: 'Mandelbrot' }))
    main?.setView(DEEP)
    fireEvent.click(screen.getByText('Home'))
    expect(main?.scene().view).toEqual(MANDELBROT_HOME)
  })
})

describe('FractalExplorerPage link', () => {
  it('copies a link that reopens the view', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const linked = { ...DEFAULT_LOCATION, kind: 'julia' as const }
    open(linked)
    fireEvent.click(screen.getByText('Copy link'))
    await vi.waitFor(() => {
      expect(stubs.showToast).toHaveBeenCalledOnce()
    })
    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      `${window.location.origin}/explore${formatExplorerHash(linked)}`,
    )
    expect(stubs.showToast).toHaveBeenCalledWith(
      'Link copied: it reopens this view in these colours.',
    )
  })

  it('points to the address bar when the clipboard is out of reach', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    open(DEFAULT_LOCATION)
    fireEvent.click(screen.getByText('Copy link'))
    await vi.waitFor(() => {
      expect(stubs.showToast).toHaveBeenCalledExactlyOnceWith(
        'Could not reach the clipboard. The address bar has the same link.',
      )
    })
  })
})

describe('FractalExplorerPage colour', () => {
  // A slider's name is its label and its value, both inside the <label>.
  const slider = (label: string) =>
    screen.getByRole('slider', { name: (name) => name.startsWith(label) })

  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('opens a link in its colours', () => {
    open({
      ...DEFAULT_LOCATION,
      colourCycle: 181,
      colourShift: 0.25,
      relief: 0.8,
    })
    expect(stubs.renderers[0]?.colour()).toMatchObject({
      period: 181,
      phase: 0.25,
      relief: 0.8,
    })
    expect(slider('Relief')).toHaveProperty('valueAsNumber', 0.8)
  })

  it('writes each colour change to the link', () => {
    open(DEFAULT_LOCATION)
    fireEvent.input(slider('Colour shift'), { target: { value: '0.25' } })
    fireEvent.input(slider('Relief'), { target: { value: '0.8' } })
    expect(stubs.renderers[0]?.colour()).toMatchObject({
      phase: 0.25,
      relief: 0.8,
    })
    expect(writtenHash()).toBe(
      formatExplorerHash({
        ...DEFAULT_LOCATION,
        colourShift: 0.25,
        relief: 0.8,
      }),
    )
  })

  it('leaves the colours alone while the view moves', () => {
    // A new colour object would recolour the picture on every pan.
    open(DEFAULT_LOCATION)
    const main = stubs.renderers[0]
    const colour = main?.colour()
    main?.setView({ ...MANDELBROT_HOME, zoomLog2: 3 })
    expect(main?.colour()).toBe(colour)
  })
})

describe('FractalExplorerPage readouts', () => {
  const STATUS: ExplorerStatus = {
    progress: 0.42,
    orbitPending: false,
    orbitProgress: 0,
    orbitMs: 12,
    grid: { width: 800, height: 600 },
    stepBudget: 16,
    samples: 1,
    sampleTarget: 8,
    iterationCap: undefined,
    error: undefined,
  }

  it('shows how far the picture got, a pending reference, or that it stopped', () => {
    open(DEFAULT_LOCATION)
    const report = (change: Partial<ExplorerStatus>) => {
      stubs.renderers[0]!.onStatus({ ...STATUS, ...change })
    }
    const done = () =>
      screen.getByText('Done', { selector: 'dt' }).nextElementSibling
        ?.textContent

    report({})
    expect(done()).toBe('42%')
    report({ orbitPending: true })
    expect(done()).toBe('Reference')
    report({ error: 'the orbit worker failed to start' })
    expect(done()).toBe('Error')
  })
})
