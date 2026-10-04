/**
 * A tour step on the canvas lights up only the part of it on show. With the
 * Glass panels setting on, the canvas runs on under the floating tablet
 * deck, the glass desktop sidebar and the rail's glass sheet, and says how
 * much of it each covers (data-covered-right, data-covered-left and
 * data-covered-bottom, CanvasViewport/visibleCanvas.ts): the hole stops
 * where the deck starts, starts where the sidebar ends and ends where the
 * sheet begins, and moves when any of them opens, closes or eases, which
 * resizes nothing. The attribute alone moves it.
 */
import { cleanup, render } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSpotlightTourState, SpotlightTourContext, } from '@/contexts/SpotlightTourContext'
import { ThemeContextProvider } from '@/contexts/ThemeContext'
import { SpotlightTour } from './SpotlightTour'
import type { TourContext, TourGuide } from './tourTypes'

const TOUR: TourGuide = {
  id: 'canvas-test',
  name: 'Canvas test',
  description: '',
  steps: [
    {
      target: '[data-tour-target="canvas"]',
      title: 'The canvas',
      description: 'Your flame',
    },
  ],
}

/** A 1180 x 820 landscape tablet: a 1100 px canvas beside the 80 px rail. */
const BOX = new DOMRect(80, 0, 1100, 820)
/** Under a 380 px deck. */
const COVERED = 380 / 1100
/** The tour's padding around its target (SpotlightTour.tsx). */
const PADDING = 8

/** The canvas box and its canvas, laid out as the test DOM cannot. */
function workspace(): HTMLCanvasElement {
  const box = document.createElement('div')
  box.dataset.tourTarget = 'canvas'
  const canvas = document.createElement('canvas')
  box.append(canvas)
  document.body.append(box)
  vi.spyOn(box, 'getBoundingClientRect').mockReturnValue(BOX)
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(BOX)
  return canvas
}

function mountTour() {
  const tour = createSpotlightTourState(() => TOUR)
  const tourContext = {
    finishAllAnimations: () => {},
    snapshotFlame: () => ({}),
    restoreFlame: () => {},
  } as unknown as TourContext
  render(() => (
    <ThemeContextProvider>
      <SpotlightTourContext.Provider value={tour}>
        <SpotlightTour tourContext={tourContext} />
      </SpotlightTourContext.Provider>
    </ThemeContextProvider>
  ))
  tour.startTour(TOUR.id)
  // Measure now rather than on the step's own frame.
  window.dispatchEvent(new Event('resize'))
}

/** The hole's box, from the mask that punches it. */
function hole() {
  const rect = document.querySelector('#spotlight-mask rect[fill="black"]')
  return {
    x: Number(rect?.getAttribute('x')),
    width: Number(rect?.getAttribute('width')),
  }
}

/** The hole's rows, from the same mask. */
function holeRows() {
  const rect = document.querySelector('#spotlight-mask rect[fill="black"]')
  return {
    y: Number(rect?.getAttribute('y')),
    height: Number(rect?.getAttribute('height')),
  }
}

/** Until a MutationObserver has seen an attribute change: one microtask. */
const observed = () => Promise.resolve()

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('a tour step on the canvas', () => {
  it('lights the whole canvas with nothing over it', () => {
    workspace()
    mountTour()

    expect(hole()).toEqual({ x: 80 - PADDING, width: 1100 + 2 * PADDING })
  })

  it('stops at the floating deck', () => {
    workspace().dataset.coveredRight = String(COVERED)
    mountTour()

    expect(hole()).toEqual({ x: 80 - PADDING, width: 720 + 2 * PADDING })
  })

  it('starts where the glass sidebar ends', () => {
    // 200 px of the 1100 px box under the sidebar's glass.
    workspace().dataset.coveredLeft = String(200 / 1100)
    mountTour()

    const { x, width } = hole()
    expect(x).toBeCloseTo(280 - PADDING, 6)
    expect(width).toBeCloseTo(900 + 2 * PADDING, 6)
  })

  it('measures again when the sidebar floats over it or stops', async () => {
    const canvas = workspace()
    mountTour()
    expect(hole().x).toBe(80 - PADDING)

    canvas.dataset.coveredLeft = String(200 / 1100)
    await observed()
    expect(hole().x).toBeCloseTo(280 - PADDING, 6)

    delete canvas.dataset.coveredLeft
    await observed()
    expect(hole().x).toBe(80 - PADDING)
  })

  it('measures again when the deck opens or closes over it', async () => {
    const canvas = workspace()
    mountTour()
    expect(hole().width).toBe(1100 + 2 * PADDING)

    // What the canvas does as the deck opens (useViewFraming.ts).
    canvas.dataset.coveredRight = String(COVERED)
    await observed()
    expect(hole().width).toBe(720 + 2 * PADDING)

    delete canvas.dataset.coveredRight
    await observed()
    expect(hole().width).toBe(1100 + 2 * PADDING)
  })

  it("stops above the rail's glass sheet", () => {
    // A quarter of the box's 820 px under the sheet past peek.
    workspace().dataset.coveredBottom = String(0.25)
    mountTour()

    // The box starts at the top edge, where the hole is clamped.
    expect(holeRows()).toEqual({ y: 0, height: 615 + 2 * PADDING })
  })

  it('measures again when the sheet rises or settles over it', async () => {
    // The sheet's share eases with the sheet and resizes nothing, and no
    // cover signal carries it: only the canvas's attribute says it moved.
    const canvas = workspace()
    mountTour()
    expect(holeRows().height).toBe(820 + 2 * PADDING)

    canvas.dataset.coveredBottom = String(0.25)
    await observed()
    expect(holeRows().height).toBe(615 + 2 * PADDING)

    delete canvas.dataset.coveredBottom
    await observed()
    expect(holeRows().height).toBe(820 + 2 * PADDING)
  })
})
