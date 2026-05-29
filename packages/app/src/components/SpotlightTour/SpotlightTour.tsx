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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [cardPosition, setCardPosition] = createSignal<
    'top' | 'bottom' | 'left' | 'right'
  >('bottom')
  let cardRef: HTMLDivElement | undefined

  const stepIndex = () => tour.currentStepIndex()
  const step = () => tour.currentStep()

  function findTarget(selector: string, last?: boolean): Element | null {
    try {
      const elements = document.querySelectorAll(selector)
      if (last) {
        // Walk in reverse to find the last visible match
        for (let i = elements.length - 1; i >= 0; i--) {
          const el = elements[i]!
          const rect = el.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            return el
          }
        }
        return null
      }
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i]!
        const rect = el.getBoundingClientRect()
        // Element must have dimensions to be considered visible
        if (rect.width > 0 && rect.height > 0) {
          return el
        }
      }
      return null
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

    const target = findTarget(s.target, s.targetLast)
    if (!target) {
      setHoleRect({ x: 0, y: 0, width: 0, height: 0 })
      return
    }

    // Force browser to flush pending layout so getBoundingClientRect
    // returns accurate geometry (needed when flex/grid containers haven't
    // been interacted with yet, e.g. timeline before first resize).
    void (target as HTMLElement).offsetHeight

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
      // Retry after scroll animation completes so the spotlight
      // actually lands on the now-visible element.
      setTimeout(() => {
        measureAndPosition()
      }, 350)
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

    // Use actual card dimensions if available, otherwise estimate
    const cardW = cardRef?.offsetWidth ?? 340
    const cardH = cardRef?.offsetHeight ?? 200

    // Calculate available space around target
    const spaceTop = targetRect.top
    const spaceBottom = vh - targetRect.bottom
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // Reposition on resize and scroll, and handle Escape to close
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

  // Call beforeShow/afterHide hooks on step transitions and reposition spotlight
  let prevStep: { step: ReturnType<typeof step>; index: number } | null = null
  /** Timer ID for a pending onAnimate callback -- cleared on step change. */
  let pendingAnimateTimeout: ReturnType<typeof setTimeout> | null = null
  /** The step whose onAnimate is pending -- used to fire it on early advance. */
  let pendingAnimateStep: ReturnType<typeof step> | null = null
  /** Flame descriptor snapshots captured before each step's beforeShow.
   *  Key = step index, value = deep-cloned flame descriptor. */
  const stepSnapshots = new Map<number, unknown>()
  /** Tracks whether the last navigation was backward (Back button). */
  let navigatingBack = false

  /** Generation counter incremented on each step transition. The nested
   *  rAF/setTimeout chain checks this before firing onAnimate -- if the
   *  generation has changed, the closure is stale and should be skipped. */
  let stepGeneration = 0

  createEffect(() => {
    const current = step()
    const currentIdx = stepIndex()
    const active = tour.isActive()

    // Bump generation so any pending async chains from the prior step
    // see a stale generation and bail out.
    const gen = ++stepGeneration

    // If the previous step's onAnimate hasn't fired yet (user clicked Next
    // during the grace period), fire it now so its target values are applied.
    if (pendingAnimateTimeout !== null) {
      clearTimeout(pendingAnimateTimeout)
      pendingAnimateTimeout = null
      // Only fire pending animate when going forward (not when undoing)
      if (!navigatingBack && pendingAnimateStep?.onAnimate) {
        pendingAnimateStep.onAnimate(props.tourContext)
      }
      pendingAnimateStep = null
    }

    // Finish any running animations from the previous step, snapping their
    // values to the target. This keeps state consistent when the user clicks
    // Next rapidly through several steps.
    props.tourContext.finishAllAnimations()

    if (prevStep && (currentIdx !== prevStep.index || !active)) {
      prevStep.step?.afterHide?.(props.tourContext)
    }

    if (active && current) {
      if (currentIdx !== (prevStep?.index ?? -1)) {
        if (navigatingBack) {
          // Restore the snapshot that was taken *before* the step we're
          // returning to, so the flame reverts to exactly what it was.
          const snapshot = stepSnapshots.get(currentIdx)
          if (snapshot) {
            props.tourContext.restoreFlame(snapshot)
          }
          navigatingBack = false
        } else {
          const diff = currentIdx - (prevStep?.index ?? -1)
          if (diff > 1) {
            const prevIdx = prevStep?.index ?? -1
            const activeTourObj = tour.activeTour()
            if (activeTourObj) {
              for (let i = prevIdx + 1; i < currentIdx; i++) {
                const skippedStep = activeTourObj.steps[i]
                if (skippedStep) {
                  stepSnapshots.set(i, props.tourContext.snapshotFlame())
                  skippedStep.beforeShow?.(props.tourContext)
                  if (skippedStep.onAnimate) {
                    skippedStep.onAnimate(props.tourContext)
                    props.tourContext.finishAllAnimations()
                  }
                  skippedStep.afterHide?.(props.tourContext)
                }
              }
            }
          }
          // Going forward: save a snapshot before this step modifies anything.
          stepSnapshots.set(currentIdx, props.tourContext.snapshotFlame())
        }
        current.beforeShow?.(props.tourContext)
      }
      // After beforeShow toggles panels, SolidJS renders new DOM elements
      // but the browser may need two frames to finalize layout (mount + layout).
      // Double-rAF ensures position measurement is accurate.
      // A third pass at 100ms catches the initial Show render where the card
      // ref might not be available during the first two frames.
      requestAnimationFrame(() => {
        if (gen !== stepGeneration) return // stale -- step changed
        requestAnimationFrame(() => {
          if (gen !== stepGeneration) return // stale -- step changed
          measureAndPosition()
          setTimeout(() => {
            if (gen !== stepGeneration) return // stale -- step changed
            measureAndPosition()
            // Once the spotlight has settled, schedule the animation callback.
            // The delay gives the user time to see what is highlighted before
            // values start changing.
            if (current.onAnimate) {
              const delay = current.animationDelay ?? 0
              pendingAnimateStep = current
              pendingAnimateTimeout = setTimeout(() => {
                if (gen !== stepGeneration) return // stale -- step changed
                pendingAnimateTimeout = null
                pendingAnimateStep = null
                // Finish any leftover animations before starting new ones.
                props.tourContext.finishAllAnimations()
                current.onAnimate!(props.tourContext)
              }, delay)
            }
          }, 80)
        })
      })
    }

    // Clear snapshots when tour ends
    if (!active) {
      stepSnapshots.clear()
      navigatingBack = false
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
          <svg width="0" height="0" style={{ position: 'absolute' }}>
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
                />
              </mask>
            </defs>
          </svg>

          {/* Blurred backdrop with a hole punched out (4 divs to bypass Chrome mask bug) */}
          {(() => {
            const blur = tour.activeTour()?.noBlur ? undefined : 'blur(2px)'
            const bg = tour.activeTour()?.noBlur
              ? 'rgba(0, 0, 0, 0.25)'
              : 'rgba(0, 0, 0, 0.4)'
            return (
              <div style={{ 'pointer-events': 'none', 'z-index': 1 }}>
                {/* Top */}
                <div
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: `${holeRect().y}px`,
                    background: bg,
                    'backdrop-filter': blur,
                    '-webkit-backdrop-filter': blur,
                    transition: 'height 300ms ease',
                  }}
                />
                {/* Bottom */}
                <div
                  style={{
                    position: 'fixed',
                    top: `${holeRect().y + holeRect().height}px`,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: bg,
                    'backdrop-filter': blur,
                    '-webkit-backdrop-filter': blur,
                    transition: 'top 300ms ease',
                  }}
                />
                {/* Left */}
                <div
                  style={{
                    position: 'fixed',
                    top: `${holeRect().y}px`,
                    left: 0,
                    width: `${holeRect().x}px`,
                    height: `${holeRect().height}px`,
                    background: bg,
                    'backdrop-filter': blur,
                    '-webkit-backdrop-filter': blur,
                    transition:
                      'top 300ms ease, width 300ms ease, height 300ms ease',
                  }}
                />
                {/* Right */}
                <div
                  style={{
                    position: 'fixed',
                    top: `${holeRect().y}px`,
                    left: `${holeRect().x + holeRect().width}px`,
                    right: 0,
                    height: `${holeRect().height}px`,
                    background: bg,
                    'backdrop-filter': blur,
                    '-webkit-backdrop-filter': blur,
                    transition:
                      'top 300ms ease, left 300ms ease, height 300ms ease',
                  }}
                />
              </div>
            )
          })()}

          {/* Glow ring around the highlighted element */}
          <svg class={ui.backdropSvg} width="100%" height="100%">
            <rect
              x={holeRect().x}
              y={holeRect().y}
              width={holeRect().width}
              height={holeRect().height}
              rx={8}
              fill="none"
              class={ui.holeGlow}
            />
          </svg>

          {/* Spotlight card */}
          <div
            ref={cardRef}
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
                      <button
                        class={ui.dot}
                        classList={{
                          [ui.dotActive as string]: i() === stepIndex(),
                          [ui.dotClickable as string]: true,
                        }}
                        onClick={() => {
                          const target = i()
                          if (target === stepIndex()) return
                          if (target < stepIndex()) {
                            navigatingBack = true
                          }
                          tour.goToStep(target)
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
                      navigatingBack = true
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
