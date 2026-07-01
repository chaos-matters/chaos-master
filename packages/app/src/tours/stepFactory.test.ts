import { describe, expect, it, vi } from 'vitest'
import { appTour } from './appTour'
import { example1CreationTour } from './example1CreationTour'
import { example2CreationTour } from './example2CreationTour'
import { flameCreationTour } from './flameCreationTour'
import { sidebarTour } from './sidebarTour'
import { openSidebar, openSidebarScrollTo, openTimeline, scrollTo, tourTarget, } from './stepFactory'
import { timelineTour } from './timelineTour'
import type { TourContext } from '@/components/SpotlightTour/tourTypes'

const allTours = [
  appTour,
  sidebarTour,
  timelineTour,
  flameCreationTour,
  example1CreationTour,
  example2CreationTour,
]

/** Minimal spy-backed TourContext for exercising the beforeShow helpers. */
function makeCtx(): TourContext {
  return {
    setSidebarOpen: vi.fn(),
    sidebarOpen: vi.fn(() => false),
    setTimelineOpen: vi.fn(),
    timelineOpen: vi.fn(() => false),
    setAnimationEnabled: vi.fn(),
    animationEnabled: vi.fn(() => false),
    openModal: vi.fn(),
    closeCurrentModal: vi.fn(),
    scrollToTarget: vi.fn(),
    executeCommand: vi.fn(),
    animateValue: vi.fn(() => () => {}),
    finishAllAnimations: vi.fn(),
    snapshotFlame: vi.fn(() => ({})),
    restoreFlame: vi.fn(),
  }
}

describe('tourTarget', () => {
  it('builds the data-tour-target attribute selector', () => {
    expect(tourTarget('canvas')).toBe('[data-tour-target="canvas"]')
  })
})

describe('beforeShow helpers', () => {
  it('openSidebar opens the sidebar', () => {
    const ctx = makeCtx()
    openSidebar(ctx)
    expect(ctx.setSidebarOpen).toHaveBeenCalledWith(true)
  })

  it('openTimeline opens the timeline', () => {
    const ctx = makeCtx()
    openTimeline(ctx)
    expect(ctx.setTimelineOpen).toHaveBeenCalledWith(true)
  })

  it('openSidebarScrollTo opens the sidebar and scrolls to the target', () => {
    const ctx = makeCtx()
    openSidebarScrollTo('metadata-card')(ctx)
    expect(ctx.setSidebarOpen).toHaveBeenCalledWith(true)
    expect(ctx.scrollToTarget).toHaveBeenCalledWith(
      '[data-tour-target="metadata-card"]',
    )
  })

  it('scrollTo scrolls without toggling panels', () => {
    const ctx = makeCtx()
    scrollTo('affine-editor')(ctx)
    expect(ctx.scrollToTarget).toHaveBeenCalledWith(
      '[data-tour-target="affine-editor"]',
    )
    expect(ctx.setSidebarOpen).not.toHaveBeenCalled()
    expect(ctx.setTimelineOpen).not.toHaveBeenCalled()
  })
})

describe('tour definitions', () => {
  it('every tour has a unique id', () => {
    const ids = allTours.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every step has a non-empty attribute selector, title and description', () => {
    // Most steps point at [data-tour-target="..."], but the creation tours also
    // target other attribute selectors (e.g. [data-parameter-path$="..."]); all
    // are CSS attribute selectors. This mainly guards against a step losing its
    // selector (e.g. an un-evaluated helper call or an empty string).
    const attrSelectorRe = /^\[[^\]]+\]$/
    for (const tour of allTours) {
      expect(tour.steps.length).toBeGreaterThan(0)
      for (const step of tour.steps) {
        expect(step.target, `${tour.id}: "${step.title}"`).toMatch(
          attrSelectorRe,
        )
        expect(step.title.length).toBeGreaterThan(0)
        expect(step.description.length).toBeGreaterThan(0)
      }
    }
  })

  it('nextTourId always references a defined tour', () => {
    const ids = new Set(allTours.map((t) => t.id))
    for (const tour of allTours) {
      if (tour.nextTourId) {
        expect(ids, `${tour.id}.nextTourId`).toContain(tour.nextTourId)
      }
    }
  })
})
