import type { Accessor, Setter } from 'solid-js'

export const DEFAULT_ANIMATION_DURATION_MS = 1200

export interface TourContext {
  setSidebarOpen: Setter<boolean>
  sidebarOpen: Accessor<boolean>
  setTimelineOpen: Setter<boolean>
  timelineOpen: Accessor<boolean>
  setAnimationEnabled: Setter<boolean>
  animationEnabled: Accessor<boolean>
  openModal: (name: 'loadFlame' | 'exportPng' | 'shareLink' | 'help') => void
  closeCurrentModal: () => void
  scrollToTarget: (selector: string) => void
  executeCommand: (id: string, ...args: unknown[]) => void
  animateValue: (
    start: number,
    end: number,
    durationMs: number,
    onUpdate: (value: number) => void,
  ) => () => void
  /** Immediately finish all running animateValue loops, snapping each to its
   *  end value. Called by SpotlightTour on step transitions so rapid
   *  Next clicks leave the state consistent for the next step. */
  finishAllAnimations: () => void
  /** Capture a deep clone of the current flame descriptor. */
  snapshotFlame: () => unknown
  /** Restore the flame descriptor from a previously captured snapshot. */
  restoreFlame: (snapshot: unknown) => void
}

export interface TourStep {
  /** CSS selector for the element to highlight */
  target: string
  title: string
  description: string
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
  /** When true, picks the last visible match instead of the first.
   *  Useful for highlighting the most recently created transform. */
  targetLast?: boolean
  /** Called before the step is shown -- use to toggle modals, sidebar,
   *  set initial values, and scroll to the target element. */
  beforeShow?: (ctx: TourContext) => void
  /** Called after the step is hidden */
  afterHide?: (ctx: TourContext) => void
  /** Milliseconds to wait after the spotlight lands on the target before
   *  calling `onAnimate`. Gives the user time to see what is highlighted.
   *  Defaults to 0 (no extra delay). */
  animationDelay?: number
  /** Called after `animationDelay` has elapsed. Use this for slider
   *  animations and other visual changes that should happen *after*
   *  the spotlight has settled on the target element. */
  onAnimate?: (ctx: TourContext) => void
}

export interface TourGuide {
  id: string
  name: string
  description: string
  steps: TourStep[]
  nextTourId?: string
  nextTourLabel?: string
  /** When true, the backdrop overlay uses a dark tint only (no blur).
   *  Useful for creation tours where the user needs to see the canvas clearly. */
  noBlur?: boolean
}
