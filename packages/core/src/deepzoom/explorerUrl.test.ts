import { describe, expect, it } from 'vitest'
import { JULIA_HOME } from './deepZoomView'
import { DEFAULT_COLOUR_CYCLE, DEFAULT_COLOUR_SHIFT, DEFAULT_LOCATION, DEFAULT_RELIEF, explorerDecimal, formatExplorerHash, MAX_COLOUR_CYCLE, MAX_ITERATIONS, MIN_COLOUR_CYCLE, parseExplorerHash, } from './explorerUrl'
import type { ExplorerLocation } from './explorerUrl'

describe('explorer URL fragment', () => {
  it('round-trips a deep Julia view without losing a digit', () => {
    const location: ExplorerLocation = {
      kind: 'julia',
      view: {
        centerRe: '0.2196416944187448706662261496016936214292141340785582171',
        centerIm: '-0.2795302387171297876743245096395124912436791094449249151',
        zoomLog2: 166.25,
      },
      juliaC: { re: '-0.12256116687665', im: '0.74486176661974' },
      maxIterations: 5000,
      paletteId: 'fire-2',
      colourCycle: 181,
      colourShift: 0.255,
      relief: 0.73,
      split: false,
      juliaView: JULIA_HOME,
    }
    expect(parseExplorerHash(formatExplorerHash(location))).toEqual(location)
  })

  it('round-trips a split view, both panes and the point', () => {
    const location: ExplorerLocation = {
      kind: 'mandelbrot',
      view: {
        centerRe: '-0.743643887037158704752191506114774',
        centerIm: '0.131825904205311970493132056385139',
        zoomLog2: 98.5,
      },
      juliaC: {
        re: '-0.743643887037158704752191506114700',
        im: '0.131825904205311970493132056385100',
      },
      maxIterations: 20000,
      paletteId: undefined,
      colourCycle: MAX_COLOUR_CYCLE,
      colourShift: 1,
      relief: 0,
      split: true,
      juliaView: { centerRe: '0.125', centerIm: '-0.5', zoomLog2: 3.25 },
    }
    const hash = formatExplorerHash(location)
    expect(hash).toMatch(/^#mandelbrot\?/)
    expect(parseExplorerHash(hash)).toEqual(location)
  })

  it('reads a split link as the Mandelbrot pane, whatever its head says', () => {
    const parsed = parseExplorerHash('#julia?re=0.25&im=0&z=1&split=1')
    expect(parsed.split).toBe(true)
    expect(parsed.kind).toBe('mandelbrot')
    expect(parsed.view.centerRe).toBe('0.25')
    expect(parsed.juliaView).toEqual(JULIA_HOME)
  })

  it('leaves the Julia pane out of a single-view link', () => {
    const hash = formatExplorerHash({
      ...DEFAULT_LOCATION,
      juliaView: { centerRe: '1', centerIm: '1', zoomLog2: 4 },
    })
    expect(hash).not.toMatch(/jre=|jz=|split=/)
  })

  it('leaves the Julia constant out of a Mandelbrot link', () => {
    const hash = formatExplorerHash(DEFAULT_LOCATION)
    expect(hash).toMatch(/^#mandelbrot\?/)
    expect(hash).not.toContain('cre=')
  })

  it('falls back field by field on malformed input', () => {
    const parsed = parseExplorerHash(
      '#julia?re=abc&im=1e-3&z=Infinity&it=-5&p=<script>&cycle=abc&shift=&relief=NaN',
    )
    expect(parsed.kind).toBe('julia')
    expect(parsed.view.centerRe).toBe('0')
    expect(parsed.view.centerIm).toBe('1e-3')
    expect(parsed.view.zoomLog2).toBe(0)
    expect(parsed.maxIterations).toBe(16)
    expect(parsed.paletteId).toBeUndefined()
    expect(parsed.colourCycle).toBe(DEFAULT_COLOUR_CYCLE)
    expect(parsed.colourShift).toBe(DEFAULT_COLOUR_SHIFT)
    expect(parsed.relief).toBe(DEFAULT_RELIEF)
  })

  it('carries the colour settings, so a link reopens the look as well as the place', () => {
    // A link written before the colours rode along opens with the defaults,
    // as every link did then.
    const older = parseExplorerHash(
      '#mandelbrot?re=-0.6245720880099235&im=0.4523907982835176&z=28.6&it=4000000&p=official-111',
    )
    expect(older).toMatchObject({
      paletteId: 'official-111',
      colourCycle: DEFAULT_COLOUR_CYCLE,
      colourShift: DEFAULT_COLOUR_SHIFT,
      relief: DEFAULT_RELIEF,
    })
    const hash = formatExplorerHash({
      ...older,
      colourCycle: 181,
      colourShift: 0.255,
      relief: 0.73,
    })
    expect(hash).toContain('&p=official-111&cycle=181&shift=0.255&relief=0.73')
    // At their defaults too, so a link keeps its look if a default changes.
    expect(formatExplorerHash(DEFAULT_LOCATION)).toContain(
      '&cycle=64&shift=0&relief=0.5',
    )
  })

  it('writes the cycle in whole iterations and the rest without float noise', () => {
    // The cycle slider moves in steps of a twentieth of an octave, and the
    // colour pass rounds to whole iterations.
    const hash = formatExplorerHash({
      ...DEFAULT_LOCATION,
      colourCycle: 2 ** 6.05,
      colourShift: 0.1 + 0.2,
      relief: 0.7000000000000001,
    })
    expect(hash).toContain('&cycle=66&shift=0.3&relief=0.7')
  })

  it('holds each colour setting to its slider', () => {
    expect(
      parseExplorerHash('#mandelbrot?cycle=1e9&shift=2&relief=-1'),
    ).toMatchObject({
      colourCycle: MAX_COLOUR_CYCLE,
      colourShift: 1,
      relief: 0,
    })
    expect(
      parseExplorerHash('#mandelbrot?cycle=0.5&shift=-3&relief=7'),
    ).toMatchObject({
      colourCycle: MIN_COLOUR_CYCLE,
      colourShift: 0,
      relief: 1,
    })
    expect(parseExplorerHash('#mandelbrot?cycle=99.6').colourCycle).toBe(100)
  })

  it('clamps iterations and treats an empty fragment as the default', () => {
    expect(parseExplorerHash('#mandelbrot?it=1e12').maxIterations).toBe(
      MAX_ITERATIONS,
    )
    expect(parseExplorerHash('')).toEqual(DEFAULT_LOCATION)
  })

  it('refuses coordinates a hostile link could use to stall every pan', () => {
    // A million-digit whole part, or 1e100000, parses, but every pan then
    // multiplies it out: the tab slows to a crawl without ever failing.
    const loc = parseExplorerHash(
      `#mandelbrot?re=${'9'.repeat(1_000_000)}&im=1e100000`,
    )
    expect(loc.view.centerRe).toBe(DEFAULT_LOCATION.view.centerRe)
    expect(loc.view.centerIm).toBe(DEFAULT_LOCATION.view.centerIm)
    expect(explorerDecimal('1024.5')).toBeUndefined()
    expect(explorerDecimal('1000')).toBe('1000')
    expect(explorerDecimal('-2.25')).toBe('-2.25')
    expect(explorerDecimal('+0.5')).toBe('0.5')
    // The deepest view's centre still fits.
    expect(explorerDecimal(`0.${'3'.repeat(1100)}`)).toBeDefined()
  })
})
