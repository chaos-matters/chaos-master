/**
 * The mode changes and the two view actions: what each keeps, what each
 * sends home, and that each result is a location a link can carry.
 */
import { DEFAULT_LOCATION, formatExplorerHash, JULIA_HOME, MANDELBROT_HOME, parseExplorerHash, } from '@chaos-master/core'
import { describe, expect, it } from 'vitest'
import { explorerMode, withHome, withJuliaFromCentre, withMode, } from './explorerModes'
import type { DeepZoomView, ExplorerLocation } from '@chaos-master/core'
import type { ExplorerMode } from './explorerModes'

/** Deep enough that the default c is far off screen. */
const DEEP: DeepZoomView = {
  centerRe: '-0.7436',
  centerIm: '0.1318',
  zoomLog2: 12,
}
const JULIA_VIEW: DeepZoomView = {
  centerRe: '0.1',
  centerIm: '-0.2',
  zoomLog2: 3,
}

const MANDELBROT: ExplorerLocation = {
  ...DEFAULT_LOCATION,
  maxIterations: 4000,
  paletteId: 'grayscale',
}
const JULIA: ExplorerLocation = {
  ...DEFAULT_LOCATION,
  kind: 'julia',
  view: JULIA_VIEW,
  juliaC: { re: '0.285', im: '0.01' },
}
const SPLIT: ExplorerLocation = {
  ...DEFAULT_LOCATION,
  split: true,
  view: DEEP,
  juliaC: { re: '-0.7435', im: '0.1319' },
  juliaView: JULIA_VIEW,
}

const MODES: ExplorerMode[] = ['mandelbrot', 'julia', 'split']

/** What a link to `l` carries: c where it is shown, the Julia pane in the split. */
function linked(l: ExplorerLocation) {
  const mode = explorerMode(l)
  return {
    kind: l.kind,
    split: l.split,
    view: l.view,
    maxIterations: l.maxIterations,
    paletteId: l.paletteId,
    juliaC: mode === 'mandelbrot' ? undefined : l.juliaC,
    juliaView: mode === 'split' ? l.juliaView : undefined,
  }
}

function expectSurvivesALink(l: ExplorerLocation) {
  const reopened = parseExplorerHash(formatExplorerHash(l))
  expect(linked(reopened)).toEqual(linked(l))
}

describe('explorerMode', () => {
  it.each([
    [MANDELBROT, 'mandelbrot'],
    [JULIA, 'julia'],
    [SPLIT, 'split'],
  ] as const)('reads the mode of a location', (l, mode) => {
    expect(explorerMode(l)).toBe(mode)
  })
})

describe('withMode', () => {
  it('keeps c for the split while it is on the Mandelbrot pane', () => {
    expect(withMode(MANDELBROT, 'split')).toEqual({
      ...MANDELBROT,
      split: true,
      juliaView: JULIA_HOME,
    })
  })

  it('moves c to the view centre for the split when it is off screen', () => {
    const deep = { ...MANDELBROT, view: DEEP }
    expect(withMode(deep, 'split')).toEqual({
      ...deep,
      split: true,
      juliaView: JULIA_HOME,
      juliaC: { re: DEEP.centerRe, im: DEEP.centerIm },
    })
  })

  // At zoom 0 the smaller pane dimension spans 4, and c must lie within 40%
  // of it, 1.6, from the centre along each axis.
  it.each([
    [{ re: '1.59', im: '0' }, true],
    [{ re: '-1.59', im: '1.59' }, true],
    [{ re: '1.61', im: '0' }, false],
    [{ re: '0', im: '-1.61' }, false],
  ])('keeps c = %o on screen: %s', (juliaC, kept) => {
    const view = { centerRe: '0', centerIm: '0', zoomLog2: 0 }
    const l = { ...MANDELBROT, view, juliaC }
    expect(withMode(l, 'split').juliaC).toEqual(
      kept ? juliaC : { re: '0', im: '0' },
    )
  })

  it('gives the split a Mandelbrot pane at home, and the Julia view to the other', () => {
    expect(withMode(JULIA, 'split')).toEqual({
      ...JULIA,
      split: true,
      kind: 'mandelbrot',
      view: MANDELBROT_HOME,
      juliaView: JULIA_VIEW,
    })
  })

  it('leaves the split for the Julia set with the Julia pane as it was', () => {
    expect(withMode(SPLIT, 'julia')).toEqual({
      ...SPLIT,
      split: false,
      kind: 'julia',
      view: JULIA_VIEW,
    })
  })

  it('leaves the split for the Mandelbrot set by dropping the Julia pane', () => {
    expect(withMode(SPLIT, 'mandelbrot')).toEqual({ ...SPLIT, split: false })
  })

  it('switches between the single fractals at the home view', () => {
    expect(withMode(MANDELBROT, 'julia')).toEqual({
      ...MANDELBROT,
      kind: 'julia',
      view: JULIA_HOME,
    })
    expect(withMode(JULIA, 'mandelbrot')).toEqual({
      ...JULIA,
      kind: 'mandelbrot',
      view: MANDELBROT_HOME,
    })
  })

  it.each([MANDELBROT, JULIA, SPLIT])(
    'changes nothing for the mode it is in',
    (l) => {
      expect(withMode(l, explorerMode(l))).toBe(l)
    },
  )

  it.each(
    [MANDELBROT, { ...MANDELBROT, view: DEEP }, JULIA, SPLIT].flatMap((l) =>
      MODES.map((mode) => [explorerMode(l), mode, l] as const),
    ),
  )('goes from %s to %s as a location a link carries', (_, mode, l) => {
    const next = withMode(l, mode)
    expect(explorerMode(next)).toBe(mode)
    expectSurvivesALink(next)
  })
})

describe('withJuliaFromCentre', () => {
  it('opens the Julia set of the Mandelbrot view centre at its home', () => {
    const deep = { ...MANDELBROT, view: DEEP }
    const next = withJuliaFromCentre(deep)
    expect(next).toEqual({
      ...deep,
      kind: 'julia',
      juliaC: { re: DEEP.centerRe, im: DEEP.centerIm },
      view: JULIA_HOME,
    })
    expectSurvivesALink(next)
  })

  it('moves only the point in the split', () => {
    const next = withJuliaFromCentre(SPLIT)
    expect(next).toEqual({
      ...SPLIT,
      juliaC: { re: DEEP.centerRe, im: DEEP.centerIm },
    })
    expectSurvivesALink(next)
  })
})

describe('withHome', () => {
  it.each([
    [{ ...MANDELBROT, view: DEEP }, { view: MANDELBROT_HOME }],
    [JULIA, { view: JULIA_HOME }],
    [SPLIT, { view: MANDELBROT_HOME, juliaView: JULIA_HOME }],
  ])('sends every pane of %o home', (l, home) => {
    const next = withHome(l)
    expect(next).toEqual({ ...l, ...home })
    expectSurvivesALink(next)
  })
})
