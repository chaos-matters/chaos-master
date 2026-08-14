import { createEffect, createSignal, onCleanup, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { focusSelectors, resolveFocusElement, revealFocusElement, } from '@/recorder/focus'
import styles from './ReplaySpotlight.module.css'
import type { RecordedAction } from '@/recorder/schema'

/**
 * The follow-cam (docs/channel-content-plan.md §7).
 *
 * A dense UI at full size while something small changes in a corner is the
 * number one reason tool videos lose people — nobody can see which slider
 * moved. During a replay this dims everything, cuts a hole around the control
 * the current step touches, and captions it with the step's label.
 *
 * Three deliberate properties:
 *
 *  - **It eases rather than cuts.** The hole animates from wherever it was, so
 *    the viewer keeps their bearings between steps. Transitions are CSS, so a
 *    reduced-motion preference disables them without touching this code.
 *  - **It returns to the canvas for the result.** A step whose hint does not
 *    resolve — or a step that IS the picture, like a camera move — fades the
 *    overlay out entirely rather than spotlighting nothing. The payoff of
 *    every step is the image, and it should be shown whole.
 *  - **It never eats a click.** The whole overlay is `pointer-events: none`;
 *    the viewer can pause, scrub or take over mid-replay with it up.
 *
 * The hint comes from the recording, not from this component — that is what
 * makes a viewer's replay *directed* rather than merely re-executed.
 */

type Rect = { x: number; y: number; width: number; height: number }

/** Breathing room around the spotlit control. */
const HOLE_PADDING = 10

/** How long the caption stays up after the last step, before the overlay
 *  clears itself for the final image. */
const TAIL_MS = 900

/** Follow layout transitions briefly after each step. Long authored holds are
 * event-driven after this window instead of polling the DOM every frame. */
const LAYOUT_SETTLE_MS = 400

export function ReplaySpotlight(props: {
  /** The step being shown, or undefined at the initial flame. */
  action: RecordedAction | undefined
  /** The transport reached the natural end (as opposed to pausing/seeking). */
  finished: boolean
}) {
  const [rect, setRect] = createSignal<Rect>()
  const [caption, setCaption] = createSignal<string>()

  // The element can move while a step is on screen: a sidebar scrolls, a card
  // expands, the window resizes. Scroll/resize observers keep the hole aligned
  // after a short settling window, avoiding a permanent frame loop during
  // long captions or a paused replay.
  let frame: number | undefined
  let tailTimer: ReturnType<typeof setTimeout> | undefined
  let trackingHint: string | undefined
  let trackedElement: HTMLElement | undefined
  let revealedElement: HTMLElement | undefined
  let settleUntil = 0
  let resizeObserver: ResizeObserver | undefined
  let mutationObserver: MutationObserver | undefined
  let listenersAttached = false
  const mutationRoots = new Set<Node>()
  const layoutPeers = new Set<Node>()

  const elementContainsHint = (element: Element, hint: string) => {
    for (const selector of focusSelectors(hint)) {
      try {
        if (element.matches(selector) || element.querySelector(selector)) {
          return true
        }
      } catch {
        // A malformed imported hint must not break replay tracking.
      }
    }
    return false
  }

  const mutationTouchesFocus = (records: MutationRecord[]) => {
    const hint = trackingHint
    if (hint === undefined) return false

    const element = trackedElement
    if (element) {
      // The target and its ancestors can move the spotlight. Descendant style
      // changes cannot move the target's box without ResizeObserver firing,
      // and accepting them here would turn animated playheads/meters inside a
      // broad focus target back into permanent per-frame layout reads. Sibling
      // boxes are observed separately because their layout can move the target
      // without resizing it.
      return records.some(
        (record) =>
          mutationRoots.has(record.target) || layoutPeers.has(record.target),
      )
    }

    return records.some((record) => {
      const target = record.target
      if (target instanceof Element && elementContainsHint(target, hint)) {
        return true
      }
      return [...record.addedNodes].some(
        (node) => node instanceof Element && elementContainsHint(node, hint),
      )
    })
  }

  const measure = () => {
    const hint = trackingHint
    if (hint === undefined) return

    const element = resolveFocusElement(hint) ?? undefined
    if (!element) {
      trackedElement = undefined
      mutationRoots.clear()
      layoutPeers.clear()
      resizeObserver?.disconnect()
      setRect(undefined)
      return
    }

    if (element !== trackedElement) {
      trackedElement = element
      mutationRoots.clear()
      layoutPeers.clear()
      resizeObserver?.disconnect()
      for (
        let current: HTMLElement | null = element;
        current !== null;
        current = current.parentElement
      ) {
        mutationRoots.add(current)
        resizeObserver?.observe(current)
        const parent: HTMLElement | null = current.parentElement
        if (parent) {
          for (const sibling of Array.from(parent.children)) {
            if (sibling === current || !(sibling instanceof HTMLElement)) {
              continue
            }
            layoutPeers.add(sibling)
            resizeObserver?.observe(sibling)
          }
        }
      }
    }

    // A resolved target can still be clipped by the sidebar or another nested
    // scrollport. Reveal it once for this step, then respect manual scrolling.
    if (element !== revealedElement) {
      revealFocusElement(element)
      revealedElement = element
    }

    const box = element.getBoundingClientRect()
    const next = {
      x: box.left - HOLE_PADDING,
      y: box.top - HOLE_PADDING,
      width: box.width + HOLE_PADDING * 2,
      height: box.height + HOLE_PADDING * 2,
    }
    setRect((previous) => {
      if (
        previous &&
        previous.x === next.x &&
        previous.y === next.y &&
        previous.width === next.width &&
        previous.height === next.height
      ) {
        return previous
      }
      return next
    })
  }

  const scheduleMeasure = () => {
    if (frame !== undefined || trackingHint === undefined) return
    frame = requestAnimationFrame((now) => {
      frame = undefined
      measure()
      if (now < settleUntil) scheduleMeasure()
    })
  }

  const stopTracking = () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
    trackingHint = undefined
    trackedElement = undefined
    revealedElement = undefined
    mutationRoots.clear()
    layoutPeers.clear()
    resizeObserver?.disconnect()
    resizeObserver = undefined
    mutationObserver?.disconnect()
    mutationObserver = undefined
    if (listenersAttached) {
      document.removeEventListener('scroll', scheduleMeasure, true)
      window.removeEventListener('resize', scheduleMeasure)
      listenersAttached = false
    }
  }

  const track = (hint: string) => {
    trackingHint = hint
    settleUntil = globalThis.performance.now() + LAYOUT_SETTLE_MS
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleMeasure)
    }
    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver((records) => {
        if (mutationTouchesFocus(records)) scheduleMeasure()
      })
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          'class',
          'style',
          'hidden',
          'open',
          'data-focus-id',
          'data-tour-target',
          'data-parameter-path',
        ],
      })
    }
    document.addEventListener('scroll', scheduleMeasure, {
      capture: true,
      passive: true,
    })
    window.addEventListener('resize', scheduleMeasure)
    listenersAttached = true

    measure()
    scheduleMeasure()
  }

  createEffect(() => {
    const action = props.action
    stopTracking()
    clearTimeout(tailTimer)
    tailTimer = undefined

    if (!action) {
      setRect(undefined)
      setCaption(undefined)
      return
    }
    setCaption(action.note ?? action.label ?? action.id)
    const hint = action.focus
    if (hint === undefined) {
      setRect(undefined)
    } else {
      track(hint)
    }

    // Once playback has stopped, the last step's caption is the video's
    // closing line; clear it after a beat so the final image stands alone.
    if (props.finished) {
      tailTimer = setTimeout(() => {
        setCaption(undefined)
        setRect(undefined)
        stopTracking()
      }, TAIL_MS)
    }
  })

  onCleanup(() => {
    stopTracking()
    clearTimeout(tailTimer)
  })

  return (
    <Portal>
      <div class={styles.overlay} aria-hidden="true">
        <Show when={rect()}>
          {(hole) => (
            <div
              class={styles.hole}
              style={{
                left: `${hole().x}px`,
                top: `${hole().y}px`,
                width: `${hole().width}px`,
                height: `${hole().height}px`,
              }}
            />
          )}
        </Show>
        <Show when={caption()}>
          {(text) => <div class={styles.caption}>{text()}</div>}
        </Show>
      </div>
    </Portal>
  )
}
