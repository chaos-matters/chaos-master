/**
 * Where the tour card's arrow points: at the middle of what the step is about.
 *
 * The arrow's offset along the card's edge is where its middle sits, as its
 * class pulls its box back by half its size (SpotlightTour.module.css). The
 * placement took that half off as well, and the arrow pointed 8px before its
 * target's centre. The glass layer breaks its edge around the same offset
 * (--seam-at), so the break has to stay under the arrow. The test DOM lays
 * nothing out and applies no CSS: the card gets its size here, and the
 * arrow's box and pull come from the stylesheet.
 */
import { cleanup, render, screen } from '@solidjs/testing-library'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSpotlightTourState, SpotlightTourContext, } from '@/contexts/SpotlightTourContext'
import { ThemeContextProvider, useTheme } from '@/contexts/ThemeContext'
import { SpotlightTour } from './SpotlightTour'
import type { TourContext, TourGuide } from './tourTypes'

type Place = 'top' | 'bottom' | 'left' | 'right'

const VIEWPORT = { width: 1000, height: 800 }
/** The card as the browser lays it out. */
const CARD = { width: 300, height: 180 }

/** The inline offset that places the arrow along a card placed on a side. */
const ALONG = {
  top: 'left',
  bottom: 'left',
  left: 'top',
  right: 'top',
} as const
/** The arrow's class on a card placed on a side (arrowClassForPosition). */
const ARROW_CLASS = {
  top: '.arrowTop',
  bottom: '.arrowBottom',
  left: '.arrowLeft',
  right: '.arrowRight',
} as const

const css = readFileSync(
  join(__dirname, 'SpotlightTour.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, ' ')

/** The px length a selector's own rule gives a property, 0 if it sets none. */
function rulePx(selector: string, property: string): number {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rule =
    new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? ''
  const value = new RegExp(`(?:^|[\\s;])${property}:\\s*(-?[\\d.]+)px`).exec(
    rule,
  )?.[1]
  return value === undefined ? 0 : Number(value)
}

function ThemeIsDark() {
  useTheme().setTheme('dark')
  return null
}

/** Starts a one-step tour on a target at `rect`, its card placed on `place`. */
function mountTour(place: Place, rect: DOMRect) {
  window.innerWidth = VIEWPORT.width
  window.innerHeight = VIEWPORT.height
  const target = document.createElement('div')
  target.dataset.tourTarget = 'arrow'
  document.body.append(target)
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.getAttribute('role') === 'dialog' ? CARD.width : 0
    },
  )
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.getAttribute('role') === 'dialog' ? CARD.height : 0
    },
  )

  const guide: TourGuide = {
    id: 'arrow-test',
    name: 'Arrow test',
    description: '',
    steps: [
      {
        target: '[data-tour-target="arrow"]',
        title: 'The target',
        description: 'What the step is about',
        position: place,
      },
    ],
  }
  const tour = createSpotlightTourState(() => guide)
  const tourContext = {
    finishAllAnimations: () => {},
    snapshotFlame: () => ({}),
    restoreFlame: () => {},
  } as unknown as TourContext
  render(() => (
    <ThemeContextProvider>
      <ThemeIsDark />
      <SpotlightTourContext.Provider value={tour}>
        <SpotlightTour tourContext={tourContext} />
      </SpotlightTourContext.Provider>
    </ThemeContextProvider>
  ))
  tour.startTour(guide.id)
  // Measure now rather than on the step's own frame.
  window.dispatchEvent(new Event('resize'))
}

/**
 * The card, its arrow's box and the break in its glass edge along the edge
 * that carries the arrow, in viewport px. The arrow's box starts at the
 * card's offset, plus the arrow's inside it, plus its class's pull.
 */
function alongEdge(place: Place) {
  const along = ALONG[place]
  const card = screen.getByRole('dialog', { name: 'The target' })
  const arrow = card.querySelector<HTMLElement>('.arrow')!
  const layer = card.querySelector<HTMLElement>('.glassLayer')!
  const cardStart = parseFloat(card.style[along])
  const arrowSize = rulePx('.arrow', along === 'left' ? 'width' : 'height')
  const arrowStart =
    cardStart +
    parseFloat(arrow.style[along]) +
    rulePx(ARROW_CLASS[place], `margin-${along}`)
  return {
    cardStart,
    cardEnd: cardStart + (along === 'left' ? CARD.width : CARD.height),
    arrowStart,
    arrowMiddle: arrowStart + arrowSize / 2,
    arrowEnd: arrowStart + arrowSize,
    seamMiddle:
      cardStart + parseFloat(layer.style.getPropertyValue('--seam-at')),
  }
}

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

/**
 * Targets in two corners of the viewport. The card stops at the viewport's
 * edge, so its arrow has to leave the card's middle to reach them.
 */
const TOP_LEFT = new DOMRect(40, 40, 80, 40)
const BOTTOM_RIGHT = new DOMRect(880, 720, 80, 40)
const OFF_CENTRE = [
  { place: 'bottom', target: TOP_LEFT, middle: 80 },
  { place: 'right', target: TOP_LEFT, middle: 60 },
  { place: 'top', target: BOTTOM_RIGHT, middle: 920 },
  { place: 'left', target: BOTTOM_RIGHT, middle: 740 },
] as const

describe("the tour card's arrow", () => {
  it.each(OFF_CENTRE)(
    'points at the middle of its target from a card placed $place',
    ({ place, target, middle }) => {
      mountTour(place, target)

      expect(alongEdge(place).arrowMiddle).toBe(middle)
    },
  )

  it.each(OFF_CENTRE)(
    'keeps the break in the glass edge under it on a card placed $place',
    ({ place, target, middle }) => {
      mountTour(place, target)
      const { arrowMiddle, seamMiddle } = alongEdge(place)

      expect(seamMiddle).toBe(arrowMiddle)
      expect(seamMiddle).toBe(middle)
    },
  )

  // A target past the card's end: the arrow stops with its box 12px inside
  // the card, clear of the card's rounded corner, at either end.
  it.each([
    { place: 'bottom', end: 'start', target: new DOMRect(0, 360, 8, 80) },
    { place: 'bottom', end: 'end', target: new DOMRect(992, 360, 8, 80) },
    { place: 'right', end: 'start', target: new DOMRect(40, 0, 80, 8) },
    { place: 'right', end: 'end', target: new DOMRect(40, 792, 80, 8) },
  ] as const)(
    'stops 12px inside the $end of a card placed $place',
    ({ place, end, target }) => {
      mountTour(place, target)
      const edge = alongEdge(place)

      expect(
        end === 'start'
          ? edge.arrowStart - edge.cardStart
          : edge.cardEnd - edge.arrowEnd,
      ).toBe(12)
    },
  )
})
