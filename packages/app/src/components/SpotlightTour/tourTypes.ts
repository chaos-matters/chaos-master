import type { Accessor, Setter } from 'solid-js'

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
}

export interface TourStep {
  /** CSS selector for the element to highlight */
  target: string
  title: string
  description: string
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
  /** Called before the step is shown — use to toggle modals, sidebar, etc. */
  beforeShow?: (ctx: TourContext) => void
  /** Called after the step is hidden */
  afterHide?: (ctx: TourContext) => void
}

export interface TourGuide {
  id: string
  name: string
  description: string
  steps: TourStep[]
  nextTourId?: string
  nextTourLabel?: string
}
