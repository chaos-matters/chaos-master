import { createContext, createSignal, useContext } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { TourGuide, TourStep } from '@/components/SpotlightTour/tourTypes'

export interface SpotlightTourContextValue {
  startTour: (tourId: string) => void
  endTour: () => void
  goNext: () => void
  goPrev: () => void
  isActive: Accessor<boolean>
  activeTourId: Accessor<string | null>
  activeTour: Accessor<TourGuide | null>
  currentStepIndex: Accessor<number>
  currentStep: Accessor<TourStep | null>
  totalSteps: Accessor<number>
  isOnLastStep: Accessor<boolean>
  nextTourId: Accessor<string | undefined>
  nextTourLabel: Accessor<string | undefined>
}

export const SpotlightTourContext = createContext<SpotlightTourContextValue>()

export function useSpotlightTour() {
  const ctx = useContext(SpotlightTourContext)
  if (!ctx)
    throw new Error(
      'useSpotlightTour must be used within SpotlightTourProvider',
    )
  return ctx
}

export function createSpotlightTourState(
  getTour: (id: string) => TourGuide | undefined,
): SpotlightTourContextValue {
  const [activeTourId, setActiveTourId] = createSignal<string | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = createSignal(0)

  const activeTour = () => {
    const id = activeTourId()
    return id ? (getTour(id) ?? null) : null
  }

  const isActive = () => activeTourId() !== null

  const currentStep = () => {
    const tour = activeTour()
    if (!tour) return null
    return tour.steps[currentStepIndex()] ?? null
  }

  const totalSteps = () => activeTour()?.steps.length ?? 0

  const isOnLastStep = () => {
    const tour = activeTour()
    if (!tour) return false
    return currentStepIndex() >= tour.steps.length - 1
  }

  const nextTourId = () => activeTour()?.nextTourId
  const nextTourLabel = () => activeTour()?.nextTourLabel

  function startTour(tourId: string) {
    setActiveTourId(tourId)
    setCurrentStepIndex(0)
  }

  function endTour() {
    setActiveTourId(null)
    setCurrentStepIndex(0)
  }

  function goNext() {
    const tour = activeTour()
    if (!tour) return
    if (currentStepIndex() >= tour.steps.length - 1) {
      endTour()
    } else {
      setCurrentStepIndex((i) => i + 1)
    }
  }

  function goPrev() {
    if (currentStepIndex() <= 0) {
      endTour()
    } else {
      setCurrentStepIndex((i) => i - 1)
    }
  }

  return {
    startTour,
    endTour,
    goNext,
    goPrev,
    isActive,
    activeTourId,
    activeTour,
    currentStepIndex,
    currentStep,
    totalSteps,
    isOnLastStep,
    nextTourId,
    nextTourLabel,
  }
}
