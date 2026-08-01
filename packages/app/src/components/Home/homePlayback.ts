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

/** Why a plate is asking to animate. Ranked: `hover` outranks `auto`. */
export type PlaybackReason = 'auto' | 'hover'

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
  const loopMs = (loopFrameCount(endFrame) * 1000) / fps
  return elapsedMs >= Math.min(loopMs, maxMs)
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
  let seq = 0

  function recompute() {
    const ranked = [...wanted.entries()].sort(
      ([leftToken, left], [rightToken, right]) => {
        // A pointer on a plate is an explicit request and preempts auto-play.
        if (left.reason !== right.reason) {
          return left.reason === 'hover' ? -1 : 1
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

  return {
    request(token, reason) {
      const existing = wanted.get(token)
      if (existing?.reason === reason) {
        return
      }
      // A reason change keeps the original arrival order: upgrading from auto
      // to hover should not send the plate to the back of its new rank.
      wanted.set(token, { reason, seq: existing?.seq ?? seq++ })
      recompute()
    },
    release(token) {
      if (!wanted.delete(token)) {
        return
      }
      recompute()
    },
    isGranted(token) {
      return granted().has(token)
    },
    activeCount() {
      return granted().size
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
