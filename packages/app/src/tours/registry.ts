import { appTour } from './appTour'
import { example1CreationTour } from './example1CreationTour'
import { example2CreationTour } from './example2CreationTour'
import { flameCreationTour } from './flameCreationTour'
import { sidebarTour } from './sidebarTour'
import { timelineTour } from './timelineTour'
import type { TourGuide } from '@/components/SpotlightTour/tourTypes'

/**
 * The one place a tour id becomes a tour.
 *
 * There used to be a `getTour` switch inside App.tsx, reachable only by the
 * SpotlightTour system. Home's portal resolves an id that comes from the
 * database (`home_config.portal_tour_id`), and a second copy of the mapping
 * would mean a tour could be startable by `#tour=` yet unknown to the portal,
 * or the reverse. One registry, two callers.
 *
 * Ids are the strings `#tour=<id>` and `home_config.portal_tour_id` carry, so
 * they are effectively public: renaming one breaks existing links and rows.
 */
const TOURS: Record<string, TourGuide> = {
  app: appTour,
  'flame-creation': flameCreationTour,
  sidebar: sidebarTour,
  timeline: timelineTour,
  'example1-creation': example1CreationTour,
  'example2-creation': example2CreationTour,
}

export function getTour(id: string): TourGuide | undefined {
  return TOURS[id]
}

/** Does this build have a tour with that id? The portal's fallback test. */
export function isKnownTour(id: string): boolean {
  return id in TOURS
}

/** Every registered id, for diagnostics and for tests that enumerate them. */
export function tourIds(): string[] {
  return Object.keys(TOURS)
}
