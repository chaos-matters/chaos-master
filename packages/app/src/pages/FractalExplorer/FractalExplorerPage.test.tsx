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
import { addExplorerLocationToPng, addFlameDataToPng, extractExplorerFromPng, } from '@/utils/flameInPng'
import { compressJsonQueryParam } from '@/utils/jsonQueryParam'
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

/** Undo and redo, by their buttons. */
const historyButton = (name: 'Undo' | 'Redo') =>
  screen.getByRole<HTMLButtonElement>('button', { name })

/** The default location zoomed in by `zoomLog2` octaves. */
const zoomedTo = (zoomLog2: number) => ({ ...MANDELBROT_HOME, zoomLog2 })

describe('FractalExplorerPage drop', () => {
  const PNG_SIGNATURE = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ])
  const SAVED: ExplorerLocation = {
    ...DEFAULT_LOCATION,
    kind: 'julia',
    view: { centerRe: '0.25', centerIm: '-0.125', zoomLog2: 40.5 },
    juliaC: { re: '-0.12256', im: '0.74486' },
    maxIterations: 4000,
    colourCycle: 181,
    colourShift: 0.25,
    relief: 0.8,
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  async function pictureOf(location: ExplorerLocation) {
    const png = await addExplorerLocationToPng(PNG_SIGNATURE, location)
    return new File([png], 'Saved view.png', { type: 'image/png' })
  }

  /** A drop anywhere on the page; it bubbles to the page's drop target. */
  function drop(file: File) {
    const ev = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(ev, 'dataTransfer', {
      value: {
        files: { length: 1, item: (i: number) => (i === 0 ? file : null) },
        items: [],
        types: ['Files'],
        dropEffect: 'none',
      },
    })
    screen.getByRole('group', { name: 'Undo and redo' }).dispatchEvent(ev)
  }

  it('opens the place a saved picture carries, in its colours', async () => {
    open(DEFAULT_LOCATION)
    drop(await pictureOf(SAVED))
    await vi.waitFor(() => {
      expect(stubs.showToast).toHaveBeenCalledExactlyOnceWith(
        "Opened the view saved in 'Saved view.png'.",
      )
    })
    expect(stubs.renderers[0]?.scene()).toEqual({
      kind: 'julia',
      view: SAVED.view,
      juliaC: SAVED.juliaC,
      maxIterations: 4000,
    })
    expect(stubs.renderers[0]?.colour()).toMatchObject({
      period: 181,
      phase: 0.25,
      relief: 0.8,
    })
    expect(writtenHash()).toBe(formatExplorerHash(SAVED))
  })

  it('changes nothing for a picture with no place in it, and says so', async () => {
    open(DEFAULT_LOCATION)
    const scene = stubs.renderers[0]?.scene()
    const flamePng = addFlameDataToPng(
      await compressJsonQueryParam({ placeholder: 'flame' }),
      PNG_SIGNATURE,
    )
    drop(new File([flamePng], 'Flame.png', { type: 'image/png' }))
    await vi.waitFor(() => {
      expect(stubs.showToast).toHaveBeenCalledExactlyOnceWith(
        "'Flame.png' carries no deep-zoom location, so the view stays where it is.",
      )
    })
    expect(stubs.renderers[0]?.scene()).toBe(scene)
    expect(writtenHash()).toBe(formatExplorerHash(DEFAULT_LOCATION))
    expect(historyButton('Undo').disabled).toBe(true)
  })

  it('undo after a drop goes back to exactly where the view was', async () => {
    const before: ExplorerLocation = {
      ...DEFAULT_LOCATION,
      view: {
        centerRe: '-0.743643887037158704752191506114774',
        centerIm: '0.131825904205311970493132056385139',
        zoomLog2: 98.5,
      },
      colourShift: 0.6,
    }
    open(before)
    drop(await pictureOf(SAVED))
    await vi.waitFor(() => {
      expect(stubs.renderers[0]?.scene().kind).toBe('julia')
    })
    // A drag straight after the drop is undone first, back to the drop.
    stubs.renderers[0]!.setView(zoomedTo(3))
    fireEvent.click(historyButton('Undo'))
    expect(stubs.renderers[0]?.scene().view).toEqual(SAVED.view)
    fireEvent.click(historyButton('Undo'))
    expect(stubs.renderers[0]?.scene()).toEqual({
      kind: 'mandelbrot',
      view: before.view,
      juliaC: before.juliaC,
      maxIterations: before.maxIterations,
    })
    expect(stubs.renderers[0]?.colour()).toMatchObject({ phase: 0.6 })
    expect(writtenHash()).toBe(formatExplorerHash(before))
    fireEvent.click(historyButton('Redo'))
    expect(stubs.renderers[0]?.scene().view).toEqual(SAVED.view)
    expect(stubs.renderers[0]?.colour()).toMatchObject({ phase: 0.25 })
  })
})

describe('FractalExplorerPage save', () => {
  it('writes the location of the moment Save was pressed into the PNG', async () => {
    const shown: ExplorerLocation = {
      ...DEFAULT_LOCATION,
      view: zoomedTo(12.5),
      colourCycle: 512,
      relief: 0.2,
    }
    // The canvas and the download are the browser's; the PNG bytes are ours.
    vi.stubGlobal(
      'ImageData',
      class {
        constructor(readonly data: Uint8ClampedArray) {}
      },
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      putImageData: vi.fn(),
    } as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (done) => {
        done(new Blob([new Uint8Array(8)], { type: 'image/png' }))
      },
    )
    const downloads: Blob[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      downloads.push(blob as Blob)
      return 'blob:saved'
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      open(shown)
      stubs.renderers[0]!.onReady?.({
        readDisplay: () =>
          Promise.resolve({
            data: new Uint8ClampedArray(4),
            size: { width: 1, height: 1 },
          }),
      })
      fireEvent.click(screen.getByText('Save PNG'))
      await vi.waitFor(() => {
        expect(downloads).toHaveLength(1)
      })
      expect(await extractExplorerFromPng(downloads[0]!)).toEqual(shown)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('FractalExplorerPage undo', () => {
  // A slider's name is its label and its value, both inside the <label>.
  const slider = (label: string) =>
    screen.getByRole('slider', { name: (name) => name.startsWith(label) })
  const view = () => stubs.renderers[0]?.scene().view
  const press = (code: 'KeyZ' | 'KeyY', mods: Partial<KeyboardEvent> = {}) => {
    fireEvent.keyDown(document.activeElement ?? document.body, {
      code,
      ctrlKey: true,
      ...mods,
    })
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('starts with nothing to undo or redo', () => {
    open(DEFAULT_LOCATION)
    expect(historyButton('Undo').disabled).toBe(true)
    expect(historyButton('Redo').disabled).toBe(true)
  })

  it('takes back a whole drag in one step', () => {
    open(DEFAULT_LOCATION)
    const main = stubs.renderers[0]!
    for (let i = 1; i <= 20; i += 1) main.setView(zoomedTo(i / 4))
    vi.advanceTimersByTime(1000)
    fireEvent.click(historyButton('Undo'))
    expect(view()).toEqual(MANDELBROT_HOME)
    expect(historyButton('Undo').disabled).toBe(true)
    fireEvent.click(historyButton('Redo'))
    expect(view()).toEqual(zoomedTo(5))
    expect(historyButton('Redo').disabled).toBe(true)
  })

  it('makes a mode switch a step at once, with no wait', () => {
    open(DEFAULT_LOCATION)
    fireEvent.click(screen.getByRole('radio', { name: 'Julia' }))
    // A drag straight after, before anything settles, is a step of its own.
    stubs.renderers[0]!.setView(zoomedTo(3))
    fireEvent.click(historyButton('Undo'))
    expect(stubs.renderers[0]?.scene()).toMatchObject({
      kind: 'julia',
      view: JULIA_HOME,
    })
    fireEvent.click(historyButton('Undo'))
    expect(stubs.renderers[0]?.scene()).toMatchObject({
      kind: 'mandelbrot',
      view: MANDELBROT_HOME,
    })
  })

  it('makes Home and a followed link steps at once too', () => {
    open({ ...DEFAULT_LOCATION, view: zoomedTo(6) })
    fireEvent.click(screen.getByText('Home'))
    stubs.renderers[0]!.setView(zoomedTo(1))
    fireEvent.click(historyButton('Undo'))
    expect(view()).toEqual(MANDELBROT_HOME)
    fireEvent.click(historyButton('Undo'))
    expect(view()).toEqual(zoomedTo(6))

    const linked = { ...DEFAULT_LOCATION, view: zoomedTo(9) }
    window.history.replaceState(
      null,
      '',
      `/explore${formatExplorerHash(linked)}`,
    )
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    stubs.renderers[0]!.setView(zoomedTo(10))
    fireEvent.click(historyButton('Undo'))
    expect(view()).toEqual(zoomedTo(9))
    fireEvent.click(historyButton('Undo'))
    expect(view()).toEqual(zoomedTo(6))
  })

  it('records nothing for an undo or a redo once they settle', () => {
    open(DEFAULT_LOCATION)
    const main = stubs.renderers[0]!
    main.setView(zoomedTo(2))
    vi.advanceTimersByTime(1000)
    main.setView(zoomedTo(4))
    vi.advanceTimersByTime(1000)
    fireEvent.click(historyButton('Undo'))
    vi.advanceTimersByTime(1000)
    // Still one step forward and one back, not a new step that cleared redo.
    expect(historyButton('Redo').disabled).toBe(false)
    fireEvent.click(historyButton('Undo'))
    vi.advanceTimersByTime(1000)
    expect(view()).toEqual(MANDELBROT_HOME)
    fireEvent.click(historyButton('Redo'))
    fireEvent.click(historyButton('Redo'))
    expect(view()).toEqual(zoomedTo(4))
  })

  it('clears redo with a new move', () => {
    open(DEFAULT_LOCATION)
    const main = stubs.renderers[0]!
    main.setView(zoomedTo(2))
    vi.advanceTimersByTime(1000)
    fireEvent.click(historyButton('Undo'))
    expect(historyButton('Redo').disabled).toBe(false)
    main.setView(zoomedTo(3))
    // Pending, it already offers no redo; settled, there is none.
    expect(historyButton('Redo').disabled).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(historyButton('Redo').disabled).toBe(true)
  })

  it('keeps redo through a colour change, which amends the entry it is on', () => {
    open(DEFAULT_LOCATION)
    stubs.renderers[0]!.setView(zoomedTo(2))
    vi.advanceTimersByTime(1000)
    fireEvent.click(historyButton('Undo'))
    fireEvent.input(slider('Relief'), { target: { value: '0.8' } })
    vi.advanceTimersByTime(1000)
    expect(historyButton('Redo').disabled).toBe(false)
    // Forward to the zoomed entry, in the colours it was left in...
    fireEvent.click(historyButton('Redo'))
    expect(view()).toEqual(zoomedTo(2))
    expect(stubs.renderers[0]?.colour().relief).toBe(DEFAULT_LOCATION.relief)
    // ...and back to home, which kept its new relief.
    fireEvent.click(historyButton('Undo'))
    expect(view()).toEqual(MANDELBROT_HOME)
    expect(stubs.renderers[0]?.colour().relief).toBe(0.8)
  })

  it('undoes with Ctrl+Z, and redoes with Ctrl+Shift+Z or Ctrl+Y', () => {
    open(DEFAULT_LOCATION)
    const main = stubs.renderers[0]!
    main.setView(zoomedTo(2))
    vi.advanceTimersByTime(1000)
    press('KeyZ')
    expect(view()).toEqual(MANDELBROT_HOME)
    press('KeyZ', { shiftKey: true })
    expect(view()).toEqual(zoomedTo(2))
    press('KeyZ', { ctrlKey: false, metaKey: true })
    expect(view()).toEqual(MANDELBROT_HOME)
    press('KeyY')
    expect(view()).toEqual(zoomedTo(2))
  })

  it('leaves Ctrl+Z to a text field that has focus', () => {
    open(DEFAULT_LOCATION)
    stubs.renderers[0]!.setView(zoomedTo(2))
    vi.advanceTimersByTime(1000)
    const field = screen.getByRole('textbox', { name: 'Iteration limit' })
    field.focus()
    expect(document.activeElement).toBe(field)
    press('KeyZ')
    expect(view()).toEqual(zoomedTo(2))
  })
})
