import { describe, expect, it } from 'vitest'
import { buildBla } from './bla'
import { panView, zoomViewAt } from './deepZoomView'
import { BAILOUT } from './perturbation'
import { computeOrbit } from './referenceOrbit'
import { backdropMapping, referenceServes, referenceSpecFor, standIn, } from './referencePlan'
import type { ExplorerTarget, ReferenceState } from './referencePlan'

const base: ExplorerTarget = {
  kind: 'mandelbrot',
  view: { centerRe: '-0.75', centerIm: '0.1', zoomLog2: 20 },
  juliaC: { re: '-0.8', im: '0.156' },
  maxIterations: 1000,
  width: 800,
  height: 600,
}

function referenceFor(t: ExplorerTarget, complete = false): ReferenceState {
  return { ...referenceSpecFor(t), complete }
}

describe('reference reuse', () => {
  it('serves its own view, and a nearby pan', () => {
    const ref = referenceFor(base)
    expect(referenceServes(ref, base)).toBe(true)
    const panned = { ...base, view: panView(base.view, 500, 300, 600) }
    expect(referenceServes(ref, panned)).toBe(true)
  })

  it('is redone after a long pan', () => {
    const ref = referenceFor(base)
    const far = { ...base, view: panView(base.view, 3000, 0, 600) }
    expect(referenceServes(ref, far)).toBe(false)
  })

  it('is redone once the view outgrows its precision', () => {
    const ref = referenceFor(base)
    expect(
      referenceServes(ref, { ...base, view: { ...base.view, zoomLog2: 27 } }),
    ).toBe(true)
    expect(
      referenceServes(ref, { ...base, view: { ...base.view, zoomLog2: 29 } }),
    ).toBe(false)
  })

  it('is redone for a higher limit unless every orbit escaped', () => {
    const more = { ...base, maxIterations: 5000 }
    expect(referenceServes(referenceFor(base), more)).toBe(false)
    expect(referenceServes(referenceFor(base, true), more)).toBe(true)
  })

  it('is redone when zooming out past the BLA radius', () => {
    const ref = referenceFor(base)
    expect(
      referenceServes(ref, { ...base, view: { ...base.view, zoomLog2: 18.5 } }),
    ).toBe(true)
    expect(
      referenceServes(ref, { ...base, view: { ...base.view, zoomLog2: 17 } }),
    ).toBe(false)
  })

  it.each([0.4, 80, 1000, 3000, 3320])(
    'serves the view it was made for at zoom 2^%d',
    (zoomLog2) => {
      const deep = { ...base, view: { ...base.view, zoomLog2 } }
      expect(referenceServes(referenceFor(deep), deep)).toBe(true)
    },
  )

  it('never serves another fractal or another Julia constant', () => {
    const julia = { ...base, kind: 'julia' as const }
    expect(referenceServes(referenceFor(base), julia)).toBe(false)
    const other = { ...julia, juliaC: { re: '-0.8', im: '0.157' } }
    expect(referenceServes(referenceFor(julia), other)).toBe(false)
  })
})

describe('a stand-in reference', () => {
  const at = (zoomLog2: number) => ({
    ...base,
    view: { ...base.view, zoomLog2 },
  })

  it('keeps rendering a zoom past its precision, down to half the guard bits', () => {
    const ref = referenceFor(base)
    expect(referenceServes(ref, at(40))).toBe(false)
    expect(standIn(ref, at(40))).toEqual({ useBla: true })
    expect(standIn(ref, at(59))).toEqual({ useBla: true })
    expect(standIn(ref, at(62))).toBeUndefined()
  })

  it('keeps rendering a zoom out past its BLA radius, step by step', () => {
    expect(standIn(referenceFor(base), at(17))).toEqual({ useBla: false })
  })

  it('serves wherever the reference itself serves', () => {
    expect(standIn(referenceFor(base), base)).toEqual({ useBla: true })
  })

  it('never stands in across fractals, constants, limits or far pans', () => {
    const ref = referenceFor(base)
    expect(standIn(ref, { ...base, kind: 'julia' })).toBeUndefined()
    expect(standIn(ref, { ...base, maxIterations: 5000 })).toBeUndefined()
    const far = { ...base, view: panView(base.view, 3000, 0, 600) }
    expect(standIn(ref, far)).toBeUndefined()
    const julia = { ...base, kind: 'julia' as const }
    const other = { ...julia, juliaC: { re: '-0.8', im: '0.157' } }
    expect(standIn(referenceFor(julia), other)).toBeUndefined()
  })
})

describe('zooming out of a Julia reference', () => {
  const julia: ExplorerTarget = {
    ...base,
    kind: 'julia',
    view: { centerRe: '0.1', centerIm: '0.2', zoomLog2: 20 },
  }
  const out = (t: ExplorerTarget) => ({
    ...t,
    view: { ...t.view, zoomLog2: t.view.zoomLog2 - 3 },
  })

  it('builds the same BLA table whatever reach it is asked for', () => {
    // No `+ dc` in the recurrence, so the radii bound the delta alone, and
    // the shader checks that per pixel however far the view is zoomed out.
    const orbit = computeOrbit({
      startRe: '0.1',
      startIm: '0.2',
      cRe: '-0.8',
      cIm: '0.156',
      bits: 80,
      maxIterations: 5000,
      escapeRadius: BAILOUT,
    })
    const table = (cMaxLog2: number) =>
      new Uint8Array(buildBla(orbit, { hasDc: false, start: 0, cMaxLog2 }).data)
    expect(table(-40)).toEqual(table(10))
  })

  it('keeps serving, with its BLA table, three octaves out', () => {
    const ref = referenceFor(julia)
    expect(standIn(ref, out(julia))).toEqual({ useBla: true })
    expect(referenceServes(ref, out(julia))).toBe(true)
  })

  it('leaves the Mandelbrot set redoing its reference for the same zoom out', () => {
    const ref = referenceFor(base)
    expect(standIn(ref, out(base))).toEqual({ useBla: false })
    expect(referenceServes(ref, out(base))).toBe(false)
  })
})

describe('backdrop mapping', () => {
  it('maps the zoom anchor onto itself', () => {
    const next = { ...base, view: zoomViewAt(base.view, 120, -80, 600, 1) }
    const m = backdropMapping(base, next)!
    expect(m.scale).toBeCloseTo(0.5, 12)
    // The anchor, 120 px right and 80 px up (screen y down), in both views.
    const anchorNext = { x: 120, y: 80 }
    const inPrevious = {
      x: anchorNext.x * m.scale + m.offset.x,
      y: anchorNext.y * m.scale + m.offset.y,
    }
    // A printed centre keeps 8 bits past a pixel, so exact to 1/256 px.
    expect(inPrevious.x).toBeCloseTo(120, 2)
    expect(inPrevious.y).toBeCloseTo(80, 2)
  })

  it('follows a pan and a change of grid size', () => {
    const panned = {
      ...base,
      view: panView(base.view, 40, 0, 600),
      width: 400,
      height: 300,
    }
    const m = backdropMapping(base, panned)!
    expect(m.scale).toBeCloseTo(2, 12)
    // The new centre is 40 old pixels left of the old centre.
    expect(m.offset.x).toBeCloseTo(-40, 2)
    expect(m.offset.y).toBeCloseTo(0, 2)
  })

  it('has nothing to show across fractals', () => {
    expect(backdropMapping(base, { ...base, kind: 'julia' })).toBeUndefined()
  })
})
