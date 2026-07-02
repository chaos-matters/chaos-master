import type { TourContext } from '@/components/SpotlightTour/tourTypes'

/**
 * Shared helpers for authoring tour steps. Every step points at an element via
 * the same `[data-tour-target="..."]` attribute selector and repeats the same
 * few `beforeShow` gestures (open the sidebar/timeline, scroll to the target);
 * these keep that boilerplate in one place.
 */

/** Build the `[data-tour-target="..."]` attribute selector for a bare name. */
export function tourTarget(name: string): string {
  return `[data-tour-target="${name}"]`
}

/** beforeShow: ensure the sidebar is open. */
export function openSidebar(ctx: TourContext): void {
  ctx.setSidebarOpen(true)
}

/** beforeShow: ensure the timeline is open. */
export function openTimeline(ctx: TourContext): void {
  ctx.setTimelineOpen(true)
}

/** beforeShow builder: open the sidebar, then scroll to `name`'s element. */
export function openSidebarScrollTo(name: string) {
  return (ctx: TourContext): void => {
    ctx.setSidebarOpen(true)
    ctx.scrollToTarget(tourTarget(name))
  }
}

/** beforeShow builder: scroll to `name`'s element without toggling panels. */
export function scrollTo(name: string) {
  return (ctx: TourContext): void => {
    ctx.scrollToTarget(tourTarget(name))
  }
}
