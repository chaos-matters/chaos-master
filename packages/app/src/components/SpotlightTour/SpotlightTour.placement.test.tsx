/**
 * Where the tour card sits when its step's target does not cooperate, and
 * what its progress dots say.
 *
 * A step whose target is missing (a touch layout has none of the desktop's
 * tour targets) left the card wherever the previous step put it, or in the
 * top-left corner, with an arrow pointing at nothing. It now sits in the
 * middle of the viewport with no arrow. A card placed below a target low on
 * the screen ran off the bottom: on the App Tour's step 2 at 1440x900 its
 * Next button sat at the edge. The card is kept inside the viewport.
 *
 * The test DOM lays nothing out, so the card gets its size from a stub.
 */
import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSpotlightTourState, SpotlightTourContext, } from '@/contexts/SpotlightTourContext'
import { ThemeContextProvider, useTheme } from '@/contexts/ThemeContext'
import { SpotlightTour } from './SpotlightTour'
import type { TourContext, TourGuide, TourStep } from './tourTypes'

const VIEWPORT = { width: 1440, height: 900 }
const CARD = { width: 340, height: 204 }
/** CARD_PADDING in SpotlightTour.tsx: the card's margin to the viewport. */
const MARGIN = 16

function ThemeIsDark() {
  useTheme().setTheme('dark')
  return null
}

function mountTour(steps: TourStep[], target?: DOMRect) {
  window.innerWidth = VIEWPORT.width
  window.innerHeight = VIEWPORT.height
  if (target) {
    const el = document.createElement('div')
    el.dataset.tourTarget = 'present'
    document.body.append(el)
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(target)
  }
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
    id: 'placement-test',
    name: 'Placement test',
    description: '',
    steps,
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
  return tour
}

const step = (target: string, title: string): TourStep => ({
  target,
  title,
  description: 'What the step is about',
})

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('a tour step whose target is missing', () => {
  it('centres the card in the viewport', () => {
    mountTour([step('[data-tour-target="absent"]', 'Nowhere')])
    const card = screen.getByRole('dialog', { name: 'Nowhere' })

    expect(parseFloat(card.style.left)).toBe((VIEWPORT.width - CARD.width) / 2)
    expect(parseFloat(card.style.top)).toBe((VIEWPORT.height - CARD.height) / 2)
  })

  it('draws no arrow and breaks no edge of the glass', () => {
    mountTour([step('[data-tour-target="absent"]', 'Nowhere')])
    const card = screen.getByRole('dialog', { name: 'Nowhere' })

    expect(card.querySelector('.arrow')).toBeNull()
    expect(card.querySelector('.glassLayer')?.hasAttribute('data-seam')).toBe(
      false,
    )
  })

  it('brings the arrow back on a later step that has its target', () => {
    const tour = mountTour(
      [
        step('[data-tour-target="absent"]', 'Nowhere'),
        step('[data-tour-target="present"]', 'Here'),
      ],
      new DOMRect(600, 100, 80, 40),
    )
    tour.goNext()
    window.dispatchEvent(new Event('resize'))
    const card = screen.getByRole('dialog', { name: 'Here' })

    expect(card.querySelector('.arrow')).not.toBeNull()
  })
})

describe('a tour card placed below a target low on the screen', () => {
  it('stays inside the viewport', () => {
    // The App Tour's step 2 at 1440x900: the card's bottom landed at 912.
    mountTour(
      [{ ...step('[data-tour-target="present"]', 'Low'), position: 'bottom' }],
      new DOMRect(600, 640, 200, 40),
    )
    const card = screen.getByRole('dialog', { name: 'Low' })
    const top = parseFloat(card.style.top)

    expect(top + CARD.height).toBeLessThanOrEqual(VIEWPORT.height - MARGIN)
    expect(top).toBeGreaterThanOrEqual(MARGIN)
  })

  it('stays inside the viewport on the right, too', () => {
    mountTour(
      [{ ...step('[data-tour-target="present"]', 'Right'), position: 'right' }],
      new DOMRect(1300, 300, 100, 40),
    )
    const card = screen.getByRole('dialog', { name: 'Right' })
    const left = parseFloat(card.style.left)

    expect(left + CARD.width).toBeLessThanOrEqual(VIEWPORT.width - MARGIN)
  })
})

describe("the tour card's progress dots", () => {
  it('name the step each one goes to and mark the current one', () => {
    mountTour([
      step('[data-tour-target="absent"]', 'One'),
      step('[data-tour-target="absent"]', 'Two'),
      step('[data-tour-target="absent"]', 'Three'),
    ])

    const second = screen.getByRole('button', { name: 'Step 2 of 3' })
    expect(second).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: 'Step 1 of 3' })
        .getAttribute('aria-current'),
    ).toBe('step')
    expect(second.hasAttribute('aria-current')).toBe(false)
  })
})
