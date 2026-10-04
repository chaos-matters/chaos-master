/**
 * The tour's glass (docs/plans/glass-panels.md, phase 1).
 *
 * The four scrims around the highlighted element animate their size on
 * every step, so a blur of their own re-ran on every frame of the move, under
 * a card that blurred as well. They are a dim now, and the card is glass:
 * the primitive's panel in the dark theme and on the touch layouts, on a
 * layer behind its text and on its arrow, each of which frosts the art. The
 * desktop's light theme keeps its light card, as the glass is dark-only
 * (decision b). The test DOM applies no CSS, so this holds the inline styles
 * and the classes the stylesheet keys on.
 */
import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSpotlightTourState, SpotlightTourContext, } from '@/contexts/SpotlightTourContext'
import { ThemeContextProvider, useTheme } from '@/contexts/ThemeContext'
import { setTouchLayoutPreference } from '@/stores/workspaceLayoutStore'
import { SpotlightTour } from './SpotlightTour'
import type { TourContext, TourGuide } from './tourTypes'
import type { Theme } from '@/contexts/ThemeContext'

const TOUR: TourGuide = {
  id: 'glass-test',
  name: 'Glass test',
  description: '',
  steps: [
    { target: 'body', title: 'One', description: 'The first step' },
    { target: 'body', title: 'Two', description: 'The second step' },
  ],
}

function ThemeIs(props: { theme: Theme }) {
  useTheme().setTheme(props.theme)
  return null
}

function mountTour(theme: Theme = 'dark', guide: TourGuide = TOUR) {
  const tour = createSpotlightTourState(() => guide)
  const tourContext = {
    finishAllAnimations: () => {},
    snapshotFlame: () => ({}),
    restoreFlame: () => {},
  } as unknown as TourContext
  render(() => (
    <ThemeContextProvider>
      <ThemeIs theme={theme} />
      <SpotlightTourContext.Provider value={tour}>
        <SpotlightTour tourContext={tourContext} />
      </SpotlightTourContext.Provider>
    </ThemeContextProvider>
  ))
  tour.startTour(guide.id)
  return tour
}

/** The dim around the hole: fixed boxes that carry a background inline. */
function scrims(): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>('div')].filter(
    (el) => el.style.position === 'fixed' && el.style.background !== '',
  )
}

const card = () => screen.getByRole('dialog', { name: 'One' })

/** A direct child of the card carrying the given class. */
const cardChild = (name: string) =>
  [...card().children].find((el) => el.classList.contains(name))

afterEach(() => {
  cleanup()
  setTouchLayoutPreference('auto')
  vi.restoreAllMocks()
})

describe('the tour on glass', () => {
  it('dims around the target without a blur of its own', () => {
    mountTour()

    expect(scrims()).toHaveLength(4)
    for (const scrim of scrims()) {
      expect(scrim.style.getPropertyValue('backdrop-filter')).toBe('')
      expect(scrim.style.getPropertyValue('-webkit-backdrop-filter')).toBe('')
    }
  })

  it('makes the card glass in the dark theme', () => {
    mountTour('dark')

    expect(card().classList.contains('glassCard')).toBe(true)
  })

  it('puts the glass on a layer behind the text and on the arrow', () => {
    mountTour('dark')

    expect(cardChild('glassLayer')?.getAttribute('aria-hidden')).toBe('true')
    expect(cardChild('arrow')?.classList.contains('glassArrow')).toBe(true)
    // A blur on the card itself would make it a backdrop root, and the
    // arrow, its child, could then frost only the card's fill, not the art.
    expect(card().classList.contains('panel')).toBe(false)
  })

  it.each([
    { place: 'bottom', seam: 'top', along: 'left' },
    { place: 'top', seam: 'bottom', along: 'left' },
    { place: 'left', seam: 'right', along: 'top' },
    { place: 'right', seam: 'left', along: 'top' },
  ] as const)(
    "breaks the layer's edge at the arrow of a card placed $place",
    ({ place, seam, along }) => {
      window.innerWidth = 1000
      window.innerHeight = 800
      vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({
        left: 400,
        top: 380,
        width: 200,
        height: 40,
        right: 600,
        bottom: 420,
        x: 400,
        y: 380,
        toJSON: () => ({}),
      })
      const [first, ...rest] = TOUR.steps
      mountTour('dark', {
        ...TOUR,
        steps: [{ ...first!, position: place }, ...rest],
      })
      // The tour places its card on a resize as well as on a step.
      window.dispatchEvent(new Event('resize'))

      const layer = cardChild('glassLayer') as HTMLElement
      const arrow = cardChild('arrow') as HTMLElement
      expect(layer.dataset.seam).toBe(seam)
      expect(arrow.style[along]).toMatch(/px$/)
      expect(layer.style.getPropertyValue('--seam-at')).toBe(arrow.style[along])
    },
  )

  it('keeps the light card on the desktop in the light theme', () => {
    setTouchLayoutPreference('desktop')
    mountTour('light')

    expect(card().classList.contains('glassCard')).toBe(false)
    expect(cardChild('glassLayer')).toBeUndefined()
    expect(cardChild('arrow')?.classList.contains('glassArrow')).toBe(false)
  })

  it('makes the card glass on a touch layout in the light theme too', () => {
    setTouchLayoutPreference('touch')
    mountTour('light')

    expect(card().classList.contains('glassCard')).toBe(true)
  })
})
