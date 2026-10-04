/**
 * The tour's own Escape under an Arcade lock.
 *
 * The tour listens on window, where nothing asked whether the agent owns the
 * keyboard: under the screen lock an Escape ended a tour behind the take. It
 * stands down there, as every other key of the viewer's does, and keeps
 * Escape with the lock off and under a seat lock.
 */
import { cleanup, render } from '@solidjs/testing-library'
import { afterEach, describe, expect, it } from 'vitest'
import { resetPilot, startPilot } from '@/arcade/pilot'
import { createSpotlightTourState, SpotlightTourContext, } from '@/contexts/SpotlightTourContext'
import { ThemeContextProvider } from '@/contexts/ThemeContext'
import { SpotlightTour } from './SpotlightTour'
import type { TourContext, TourGuide } from './tourTypes'

const TOUR: TourGuide = {
  id: 'lock-test',
  name: 'Lock test',
  description: '',
  steps: [{ target: 'body', title: 'One', description: 'The first step' }],
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
  return tour
}

function drive(lock: 'screen' | 'seat') {
  startPilot({
    mode: lock === 'screen' ? 'cinema' : 'duel',
    title: 'Driving',
    stepBudget: 10,
    allowed: ['timeline.'],
    qualityRankAtStart: 1,
    seatId: lock === 'screen' ? 'player' : 'rival',
    lock,
  })
}

function pressEscape() {
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  )
}

afterEach(() => {
  cleanup()
  resetPilot()
})

describe('Escape on a running tour', () => {
  it('leaves the tour alone while the agent owns the screen', () => {
    const tour = mountTour()
    drive('screen')

    pressEscape()

    expect(tour.isActive()).toBe(true)
  })

  it('ends the tour with the lock off', () => {
    const tour = mountTour()

    pressEscape()

    expect(tour.isActive()).toBe(false)
  })

  it('ends the tour under a seat lock', () => {
    const tour = mountTour()
    drive('seat')

    pressEscape()

    expect(tour.isActive()).toBe(false)
  })
})
