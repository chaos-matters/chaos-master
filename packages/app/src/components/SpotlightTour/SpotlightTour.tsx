import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { useSpotlightTour } from '@/contexts/SpotlightTourContext'
import ui from './SpotlightTour.module.css'
import type { TourContext } from './tourTypes'

interface SpotlightTourProps {
  tourContext: TourContext
}

const CARD_PADDING = 16
const HOLE_PADDING = 8

export function SpotlightTour(props: SpotlightTourProps) {
  const tour = useSpotlightTour()

  const [holeRect, setHoleRect] = createSignal({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  })
  const [cardStyle, setCardStyle] = createSignal<Record<string, string>>({})
  const [arrowStyle, setArrowStyle] = createSignal<Record<string, string>>({})
  const [arrowClass, setArrowClass] = createSignal('')
  const [cardPosition, setCardPosition] = createSignal<
    'top' | 'bottom' | 'left' | 'right'
  >('bottom')

  const stepIndex = () => tour.currentStepIndex()
  const step = () => tour.currentStep()

  function findTarget(selector: string): Element | null {
    try {
      return document.querySelector(selector)
    } catch {
      return null
    }
  }

  function measureAndPosition() {
    const s = step()
    if (!s) {
      setHoleRect({ x: 0, y: 0, width: 0, height: 0 })
      return
    }

    const target = findTarget(s.target)
    if (!target) {
      setHoleRect({ x: 0, y: 0, width: 0, height: 0 })
      return
    }

    const targetRect = target.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Check if target is in viewport
    const isOffScreen =
      targetRect.bottom < 0 ||
      targetRect.top > vh ||
      targetRect.right < 0 ||
      targetRect.left > vw

    if (isOffScreen) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    const holeX = targetRect.left - HOLE_PADDING
    const holeY = targetRect.top - HOLE_PADDING
    const holeW = targetRect.width + HOLE_PADDING * 2
    const holeH = targetRect.height + HOLE_PADDING * 2

    setHoleRect({
      x: Math.max(0, holeX),
      y: Math.max(0, holeY),
      width: holeW,
      height: holeH,
    })

    // Measure card for positioning
    // Estimate card dimensions (actual card will be measured after DOM render)
    const cardW = 340
    const cardH = 200

    // Calculate available space around target
    const spaceTop = targetRect.top
    const spaceBottom = vh - targetRect.bottom
    const spaceLeft = targetRect.left
    const spaceRight = vw - targetRect.right

    const preferred = s.position ?? 'auto'

    let pos: 'top' | 'bottom' | 'left' | 'right'
    if (preferred !== 'auto') {
      pos = preferred
    } else {
      // Prefer bottom, then top, then right, then left
      if (spaceBottom >= cardH + CARD_PADDING) {
        pos = 'bottom'
      } else if (spaceTop >= cardH + CARD_PADDING) {
        pos = 'top'
      } else if (spaceRight >= cardW + CARD_PADDING) {
        pos = 'right'
      } else {
        pos = 'left'
      }
    }

    setCardPosition(pos)
    setArrowClass(arrowClassForPosition(pos))

    // Calculate card position
    let cardLeft: number
    let cardTop: number

    const targetCenterX = targetRect.left + targetRect.width / 2
    const targetCenterY = targetRect.top + targetRect.height / 2

    if (pos === 'bottom') {
      cardLeft = clamp(
        targetCenterX - cardW / 2,
        CARD_PADDING,
        vw - cardW - CARD_PADDING,
      )
      cardTop = targetRect.bottom + CARD_PADDING + 12
    } else if (pos === 'top') {
      cardLeft = clamp(
        targetCenterX - cardW / 2,
        CARD_PADDING,
        vw - cardW - CARD_PADDING,
      )
      cardTop = targetRect.top - cardH - CARD_PADDING - 12
    } else if (pos === 'right') {
      cardLeft = targetRect.right + CARD_PADDING + 12
      cardTop = clamp(
        targetCenterY - cardH / 2,
        CARD_PADDING,
        vh - cardH - CARD_PADDING,
      )
    } else {
      cardLeft = targetRect.left - cardW - CARD_PADDING - 12
      cardTop = clamp(
        targetCenterY - cardH / 2,
        CARD_PADDING,
        vh - cardH - CARD_PADDING,
      )
    }

    setCardStyle({
      top: `${Math.max(CARD_PADDING, cardTop)}px`,
      left: `${Math.max(CARD_PADDING, cardLeft)}px`,
    })

    // Position the arrow to point at the target center, not card center
    const arrowHalf = 8 // half of 16px arrow size
    let arrowOffsetStyle: Record<string, string> = {}
    if (pos === 'top' || pos === 'bottom') {
      const arrowLeft = clamp(
        targetCenterX - cardLeft - arrowHalf,
        12,
        cardW - 12 - 16,
      )
      arrowOffsetStyle = { left: `${arrowLeft}px` }
    } else {
      const arrowTop = clamp(
        targetCenterY - cardTop - arrowHalf,
        12,
        cardH - 12 - 16,
      )
      arrowOffsetStyle = { top: `${arrowTop}px` }
    }
    setArrowStyle(arrowOffsetStyle)
  }

  function arrowClassForPosition(
    pos: 'top' | 'bottom' | 'left' | 'right',
  ): string {
    switch (pos) {
      case 'top':
        return ui.arrowTop!
      case 'bottom':
        return ui.arrowBottom!
      case 'left':
        return ui.arrowLeft!
      case 'right':
        return ui.arrowRight!
    }
  }

  // Reposition on step change, resize, and scroll
  createEffect(() => {
    void stepIndex()
    void step()
    measureAndPosition()
  })

  createEffect(() => {
    if (!tour.isActive()) return

    const onResize = () => {
      measureAndPosition()
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, { capture: true })

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        tour.endTour()
      }
    }
    window.addEventListener('keydown', onKeyDown)

    onCleanup(() => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, { capture: true })
      window.removeEventListener('keydown', onKeyDown)
    })
  })

  // Call beforeShow/afterHide hooks on step transitions
  let prevStep: { step: ReturnType<typeof step>; index: number } | null = null
  createEffect(() => {
    const current = step()
    const currentIdx = stepIndex()
    const active = tour.isActive()

    if (prevStep && (currentIdx !== prevStep.index || !active)) {
      prevStep.step?.afterHide?.(props.tourContext)
    }

    if (active && current && currentIdx !== (prevStep?.index ?? -1)) {
      current.beforeShow?.(props.tourContext)
    }

    prevStep = active ? { step: current, index: currentIdx } : null
  })

  // Clean up hash on tour end
  createEffect(() => {
    if (!tour.isActive()) {
      if (window.location.hash.startsWith('#tour=')) {
        window.location.hash = ''
      }
    }
  })

  return (
    <Show when={tour.isActive() && step()}>
      <Portal>
        <div class={ui.overlay}>
          {/* SVG mask backdrop */}
          <svg class={ui.backdropSvg} width="100%" height="100%">
            <defs>
              <mask id="spotlight-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={holeRect().x}
                  y={holeRect().y}
                  width={holeRect().width}
                  height={holeRect().height}
                  rx={8}
                  fill="black"
                  data-hole="true"
                />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0, 0, 0, 0.5)"
              mask="url(#spotlight-mask)"
            />
            {/* Glow ring around the highlighted element */}
            <rect
              x={holeRect().x}
              y={holeRect().y}
              width={holeRect().width}
              height={holeRect().height}
              rx={8}
              fill="none"
              stroke="rgba(255, 255, 255, 0.35)"
              stroke-width="2"
              class={ui.holeGlow}
            />
          </svg>

          {/* Spotlight card */}
          <div
            class={ui.card}
            style={cardStyle()}
            role="dialog"
            aria-label={step()?.title}
          >
            <div
              class={ui.arrow}
              classList={{ [arrowClass()]: true }}
              style={arrowStyle()}
            />

            <div class={ui.stepCounter}>
              Step {stepIndex() + 1} of {tour.totalSteps()}
            </div>

            <h3 class={ui.title}>{step()?.title}</h3>
            <p class={ui.description}>{step()?.description}</p>

            <div class={ui.footer}>
              <Show when={tour.isOnLastStep() && !!tour.nextTourId()}>
                <button
                  class={ui.nextTourBtn}
                  onClick={() => {
                    const nextId = tour.nextTourId()
                    if (nextId) {
                      tour.startTour(nextId)
                    }
                  }}
                >
                  {tour.nextTourLabel() ?? 'Next Tour'}
                </button>
              </Show>
              <Show when={!(tour.isOnLastStep() && !!tour.nextTourId())}>
                <div class={ui.dots}>
                  <For each={Array.from({ length: tour.totalSteps() })}>
                    {(_, i) => (
                      <div
                        class={ui.dot}
                        classList={{
                          [ui.dotActive as string]: i() === stepIndex(),
                        }}
                      />
                    )}
                  </For>
                </div>
              </Show>

              <div class={ui.navButtons}>
                <button
                  class={ui.skipBtn}
                  onClick={() => {
                    tour.endTour()
                  }}
                >
                  Skip
                </button>
                <Show when={stepIndex() > 0}>
                  <button
                    class={ui.prevBtn}
                    onClick={() => {
                      tour.goPrev()
                    }}
                  >
                    Back
                  </button>
                </Show>
                <button
                  class={ui.nextBtn}
                  onClick={() => {
                    tour.goNext()
                  }}
                >
                  {stepIndex() < tour.totalSteps() - 1 ? 'Next' : 'Done'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
