import { createSignal } from 'solid-js'
import type { Accessor } from 'solid-js'

/**
 * Home — Phase 3. The playback rules for the "In motion" section, kept out of
 * the components so they can be tested without a GPU, a DOM or a gallery.
 *
 * The section's whole design constraint is restraint: "everything moving at
 * once reads as a screensaver, not a gallery" (docs/plans/home-tab-plan.md). So
 * playback is a scarce resource that plates ask for and may not get, rather
 * than something each plate decides for itself:
 *
 *  - at most `MAX_CONCURRENT_PLAYBACK` plates animate at any moment,
 *  - a pointer on a plate outranks an auto-play run (an explicit request beats
 *    an ambient one), and
 *  - a plate that already holds a slot keeps it, so a neighbour settling into
 *    view cannot make a running animation stutter.
 *
 * Two rules were added after direct testing said the section felt twitchy, and
 * both are about NOT restarting things:
 *
 *  - the first pointer anywhere retires auto-play page-wide (`pointerActive`),
 *    so hovering one plate can never be the reason a DIFFERENT plate stops
 *    mid-loop, and
 *  - a run that loses its reason plays out the rest of its loop rather than
 *    cutting back (`loopCompletesAtMs`), so a pointer that leaves and returns
 *    finds the same run still going instead of starting a new one.
 *
 * The frame maths is deliberately elapsed-time based rather than a tick
 * counter: a plate that misses frames (GPU busy, tab backgrounded) must still
 * land back on its poster frame at the same wall-clock moment, and a run that
 * is defined as "one loop from the poster frame" then lands there exactly.
 */

/**
 * Playback rate. The gallery's stored envelope is `{ tracks }` only — no
 * TimelineConfig — so there is no per-row fps to honour; this matches
 * `defaultConfig()` in utils/timeline.ts, which is what the editor plays these
 * same rows back at.
 */
export const PLAYBACK_FPS = 30

/** Hard cap on plates animating simultaneously. */
export const MAX_CONCURRENT_PLAYBACK = 2

/**
 * An auto-play run stops after one loop or this, whichever comes first. The
 * cap only bites for an unusually long timeline; the curated rows loop in ~3s.
 */
export const AUTO_PLAY_MAX_MS = 6000

/**
 * Why a plate is asking to animate. Ranked `hover` > `finishing` > `auto`:
 *
 *  - `hover` is an explicit request and outranks everything,
 *  - `finishing` is a run that has lost its reason but is playing out the rest
 *    of its loop so it can land back on the poster frame instead of cutting to
 *    it — already-moving pixels, so it outranks a run that has not started,
 *  - `auto` is the ambient greeting, and the first pointer on the page retires
 *    it (see `pointerActive`).
 */
export type PlaybackReason = 'auto' | 'finishing' | 'hover'

/** Higher wins a slot. See {@link PlaybackReason}. */
const REASON_RANK: Record<PlaybackReason, number> = {
  hover: 2,
  finishing: 1,
  auto: 0,
}

/**
 * Frames in one loop. Timelines here run `0..endFrame` INCLUSIVE (that is what
 * `getUserEndFrame` reports and what the editor plays), so a 90-frame timeline
 * is 91 distinct frames.
 */
export function loopFrameCount(endFrame: number): number {
  return Math.max(1, Math.floor(endFrame) + 1)
}

/**
 * The frame `elapsedMs` into a run that began at `startFrame`, wrapping at the
 * end of the timeline. Quantised to whole frames on purpose: the caller feeds
 * this into a signal, and a repeated value is a no-op, so a 120Hz display does
 * not re-pose (and re-clone) the descriptor twice per animation frame.
 */
export function frameAtElapsed(
  startFrame: number,
  endFrame: number,
  elapsedMs: number,
  fps: number = PLAYBACK_FPS,
): number {
  const total = loopFrameCount(endFrame)
  const start = ((Math.floor(startFrame) % total) + total) % total
  const advanced = Math.floor((Math.max(0, elapsedMs) * fps) / 1000)
  return (start + advanced) % total
}

/** Wall-clock length of one whole loop of a `0..endFrame` timeline. */
export function timelineLoopMs(
  endFrame: number,
  fps: number = PLAYBACK_FPS,
): number {
  return (loopFrameCount(endFrame) * 1000) / fps
}

/**
 * Has an auto-play run finished? One full loop, so the run ends on the very
 * frame it started from — which is the poster frame, which is why the freeze
 * back to the poster has nothing to jump between. `AUTO_PLAY_MAX_MS` is the
 * backstop for a timeline long enough that a full loop would stop being brief.
 */
export function autoPlayComplete(
  elapsedMs: number,
  endFrame: number,
  fps: number = PLAYBACK_FPS,
  maxMs: number = AUTO_PLAY_MAX_MS,
): boolean {
  return elapsedMs >= Math.min(timelineLoopMs(endFrame, fps), maxMs)
}

/**
 * When a run that is `elapsedMs` in will next land back where it started.
 *
 * This is what "the pointer left, so play out the rest of the loop" is made of.
 * A plate stopped the instant the pointer leaves would freeze on an arbitrary
 * frame and then cut to its poster; a plate that keeps going until the playhead
 * comes round to the frame it started from lands on the poster's own image, so
 * there is nothing to cut between — and a pointer that comes back mid-tail
 * finds a run still going and simply keeps it, which is the whole point: a
 * pointer crossing a plate must never restart it.
 *
 * Exactly on a boundary (including elapsed 0) the answer is "now": the run has
 * already landed and has nothing left to play.
 */
export function loopCompletesAtMs(elapsedMs: number, loopMs: number): number {
  if (!(loopMs > 0)) {
    return 0
  }
  return Math.ceil(Math.max(0, elapsedMs) / loopMs) * loopMs
}

// ── Curated sequences ──────────────────────────────────────────────────────
// A row may carry an ORDERED list of extra descriptors in `gallery_items.
// sequence` — for `cap-randomizer`, an initial roll of the dice followed by
// flames derived from it, so the card shows "roll a whole flame, then steer it"
// rather than asserting it. The player walks a FLAT list and wraps, so a row
// holding two curated paths one after another needs no player change at all:
// it is simply a longer walk.

/** How long one flame in a curated sequence holds before the next. */
export const SEQUENCE_STEP_MS = 900

/** Wall-clock length of one whole walk through `count` flames. */
export function sequenceLoopMs(
  count: number,
  stepMs: number = SEQUENCE_STEP_MS,
): number {
  return Math.max(0, Math.floor(count)) * Math.max(1, stepMs)
}

/**
 * Which entry of the walk is showing `elapsedMs` in.
 *
 * Index 0 is the row's OWN flame — the one the poster was captured from — and
 * `1..n` are the stored derived flames, so a row with no `sequence` has a walk
 * of one and this is always 0. That is the fallback: the same code path, the
 * same plate, resting on its own descriptor exactly as it does today.
 */
export function sequenceIndexAt(
  elapsedMs: number,
  count: number,
  stepMs: number = SEQUENCE_STEP_MS,
): number {
  const total = Math.max(1, Math.floor(count))
  const step = Math.max(1, stepMs)
  return Math.floor(Math.max(0, elapsedMs) / step) % total
}

// ── The "Made here" portal's visibility rules ──────────────────────────────

/**
 * How much of the portal must be on screen before it plays.
 *
 * The portal is a large element and the section is a destination, so merely
 * clipping the bottom of the viewport is not "the user is looking at it" — it
 * has to substantially fill the screen. Expressed as an IntersectionObserver
 * threshold rather than a rootMargin: a margin moves WHERE the element counts
 * as visible, which is the opposite of what is wanted here.
 */
export const PORTAL_PLAY_RATIO = 0.8

/**
 * What the portal is doing.
 *
 *  - `idle` — nothing applied; the next run starts from the first step,
 *  - `playing` — advancing through the script,
 *  - `held` — stopped on the frame it reached, ready to carry on.
 */
export type PortalPlayback = 'idle' | 'playing' | 'held'

/**
 * How much of the viewport-worth of the portal is showing, 0..1.
 *
 * `IntersectionObserver`'s own `intersectionRatio` is a fraction of the TARGET,
 * which cannot reach 0.8 for a target taller than the root — on a short window
 * the portal would then never play. Measuring against whichever is smaller
 * makes the threshold mean "80% of what could possibly be shown of it", so a
 * tall portal qualifies once it covers 80% of the viewport.
 */
export function visibleFraction(
  targetHeight: number,
  rootHeight: number,
  visibleHeight: number,
): number {
  const reference = Math.min(
    Math.max(0, targetHeight),
    Math.max(0, rootHeight) || Math.max(0, targetHeight),
  )
  if (reference <= 0) {
    return 0
  }
  return Math.min(1, Math.max(0, visibleHeight) / reference)
}

/**
 * The portal's whole scroll behaviour, as one transition.
 *
 * Restarting the build on every small scroll is the thing this exists to stop,
 * so the rules are asymmetric on purpose:
 *
 *  - it starts only once `threshold` of it is showing,
 *  - while it stays at or above the threshold, scrolling changes NOTHING — a
 *    nudge is a no-op, not a restart,
 *  - dropping below the threshold stops it where it is and keeps every value
 *    the script has set (`held`), so scrolling back resumes rather than replays,
 *  - and only leaving the screen entirely (ratio 0) resets it, so the next
 *    approach opens on the first step.
 *
 * `held` never starts on its own: from `idle`, a partial view is still `idle`.
 * Otherwise scrolling the portal halfway up from below would begin the build
 * off-screen and the section would open mid-way through it.
 */
export function nextPortalPlayback(
  current: PortalPlayback,
  fraction: number,
  threshold: number = PORTAL_PLAY_RATIO,
): PortalPlayback {
  if (!(fraction > 0)) {
    return 'idle'
  }
  if (fraction >= threshold) {
    return 'playing'
  }
  return current === 'idle' ? 'idle' : 'held'
}

/**
 * The step a scrubber at `fraction` across its track is pointing at.
 *
 * The track maps step 0 to the left edge and the last step to the right, so
 * both ends are reachable by dragging to the end rather than by landing inside
 * a half-width band — which is what a `floor(fraction * count)` mapping would
 * require for the last step.
 */
export function stepFromFraction(fraction: number, stepCount: number): number {
  const last = Math.max(0, Math.floor(stepCount) - 1)
  if (last === 0) {
    return 0
  }
  const raw = Math.round(Math.min(1, Math.max(0, fraction)) * last)
  return Math.min(last, Math.max(0, raw))
}

export interface PlaybackCoordinator {
  /** Ask to animate. Re-requesting with a new reason re-ranks the plate. */
  request: (token: symbol, reason: PlaybackReason) => void
  /** Stop asking. Idempotent — safe from `onCleanup`. */
  release: (token: symbol) => void
  /** Reactive: does this plate hold one of the slots right now? */
  isGranted: (token: symbol) => boolean
  /** Reactive: how many plates are animating. Never exceeds `capacity`. */
  activeCount: () => number
  /**
   * Reactive: is a pointer on ANY plate right now?
   *
   * The one piece of deliberate cross-plate signalling on the page, and it
   * exists to remove the accidental kind. Auto-play is an ambient greeting on
   * arrival; hover is the user taking over. With both alive at once, a page
   * capped at two slots means pointing at a third plate preempts a plate that
   * was mid-loop — the user sees a plate they are NOT pointing at stop dead,
   * which is exactly the cross-talk complained about. So the first pointer
   * anywhere in the section retires auto-play instead: the greeting is over,
   * every plate lands cleanly on its poster frame, and from then on the only
   * thing asking for a slot is the one plate under the pointer.
   */
  pointerActive: () => boolean
}

/**
 * Hands out at most `capacity` playback slots.
 *
 * One of these is created per Home page (in HomeTab) and passed to every plate,
 * so the cap is global to the page rather than per section — a hovered gallery
 * plate and an auto-playing motion tile compete for the same two slots.
 */
export function createPlaybackCoordinator(
  capacity: number = MAX_CONCURRENT_PLAYBACK,
): PlaybackCoordinator {
  interface Request {
    reason: PlaybackReason
    /** Arrival order, for a stable tie-break. */
    seq: number
  }
  const wanted = new Map<symbol, Request>()
  /**
   * The granted set is held twice: as a plain Set that `recompute` reads (it is
   * called from callers' effects, and reading the signal there would make those
   * effects depend on the grant they are about to change), and as a signal that
   * plates subscribe to.
   */
  let held: Set<symbol> = new Set()
  const [granted, setGranted] = createSignal<ReadonlySet<symbol>>(held)
  const [hovering, setHovering] = createSignal(0)
  let seq = 0

  function recompute() {
    const ranked = [...wanted.entries()].sort(
      ([leftToken, left], [rightToken, right]) => {
        // An explicit request beats a run playing itself out, which beats the
        // ambient greeting. See PlaybackReason.
        const rank = REASON_RANK[right.reason] - REASON_RANK[left.reason]
        if (rank !== 0) {
          return rank
        }
        // Incumbency: a plate already animating keeps its slot, so a plate
        // settling into view next to it cannot interrupt a run mid-loop.
        const leftHeld = held.has(leftToken) ? 0 : 1
        const rightHeld = held.has(rightToken) ? 0 : 1
        if (leftHeld !== rightHeld) {
          return leftHeld - rightHeld
        }
        return left.seq - right.seq
      },
    )
    const next = new Set(
      ranked.slice(0, Math.max(0, capacity)).map(([token]) => token),
    )
    if (
      next.size === held.size &&
      [...next].every((token) => held.has(token))
    ) {
      return
    }
    held = next
    setGranted(next)
  }

  /** Keeps `pointerActive` in step with the requests, without scanning them. */
  function countHover(reason: PlaybackReason | undefined, delta: number) {
    if (reason === 'hover') {
      setHovering((n) => Math.max(0, n + delta))
    }
  }

  return {
    request(token, reason) {
      const existing = wanted.get(token)
      if (existing?.reason === reason) {
        return
      }
      countHover(existing?.reason, -1)
      countHover(reason, 1)
      // A reason change keeps the original arrival order: upgrading from auto
      // to hover should not send the plate to the back of its new rank.
      wanted.set(token, { reason, seq: existing?.seq ?? seq++ })
      recompute()
    },
    release(token) {
      const existing = wanted.get(token)
      if (!wanted.delete(token)) {
        return
      }
      countHover(existing?.reason, -1)
      recompute()
    },
    isGranted(token) {
      return granted().has(token)
    },
    activeCount() {
      return granted().size
    },
    pointerActive() {
      return hovering() > 0
    },
  }
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

let reducedMotion: Accessor<boolean> | undefined

/**
 * Reactive `prefers-reduced-motion: reduce`.
 *
 * Home honours it by dropping AUTO-play entirely while still allowing
 * hover-play: the setting is about motion the user did not ask for, and a
 * pointer deliberately held on a plate is a request. The CSS side of the same
 * preference already lives in HomeTab.module.css (poster cross-fade, smooth
 * scroll).
 *
 * One lazily-created module-level signal with one listener for the whole app,
 * exactly like `useIsScrolling` — the media query is a property of the device,
 * not of any component, and there is nothing to tear down.
 */
export function usePrefersReducedMotion(): Accessor<boolean> {
  if (reducedMotion !== undefined) {
    return reducedMotion
  }
  const query = globalThis.matchMedia?.(REDUCED_MOTION_QUERY)
  const [value, setValue] = createSignal(query?.matches ?? false)
  query?.addEventListener('change', (event) => {
    setValue(event.matches)
  })
  reducedMotion = value
  return value
}
