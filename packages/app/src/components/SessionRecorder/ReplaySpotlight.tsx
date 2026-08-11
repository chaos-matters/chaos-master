import { createEffect, createSignal, onCleanup, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { resolveFocusElement } from '@/recorder/focus'
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

export function ReplaySpotlight(props: {
  /** The step being shown, or undefined at the initial flame. */
  action: RecordedAction | undefined
  /** Playback is running — a paused replay keeps the spotlight up so the
   *  viewer can look at what is highlighted for as long as they like. */
  playing: boolean
}) {
  const [rect, setRect] = createSignal<Rect>()
  const [caption, setCaption] = createSignal<string>()

  // The element can move while a step is on screen: a sidebar scrolls, a card
  // expands, the window resizes. Re-measuring on a frame loop is simpler than
  // wiring a ResizeObserver plus a scroll listener per target, and it only
  // runs while a hint is actually resolved.
  let frame: number | undefined
  let tailTimer: ReturnType<typeof setTimeout> | undefined

  const stopTracking = () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
  }

  const track = (hint: string) => {
    const measure = () => {
      const element = resolveFocusElement(hint)
      if (!element) {
        // The control is not on screen — a collapsed card, a closed panel.
        // Show the canvas rather than a hole over nothing.
        setRect(undefined)
      } else {
        const box = element.getBoundingClientRect()
        setRect({
          x: box.left - HOLE_PADDING,
          y: box.top - HOLE_PADDING,
          width: box.width + HOLE_PADDING * 2,
          height: box.height + HOLE_PADDING * 2,
        })
      }
      frame = requestAnimationFrame(measure)
    }
    measure()
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
    if (!props.playing) {
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
