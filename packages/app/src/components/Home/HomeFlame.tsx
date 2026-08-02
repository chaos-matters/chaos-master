import { createEffect, createMemo, createSignal, on, onCleanup, Show, untrack, } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { useComputeGate } from '@/contexts/ComputeGateContext'
import { Flam3 } from '@/flame/Flam3'
import { validateFlame } from '@/flame/schema/flameSchema'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Default3DPreviewCamera } from '@/lib/Camera3D'
import { fetchGalleryItem, sequenceFlames } from '@/lib/galleryContent'
import { gpuReady } from '@/lib/gpuStatus'
import { deepClone } from '@/utils/clone'
import { useIsScrolling } from '@/utils/isScrolling'
import { applyTracksToFlame, getUserEndFrame } from '@/utils/timeline'
import { setLivePreviewLive, vramLog } from '@/utils/vramLog'
import { AUTO_PLAY_MAX_MS, frameAtElapsed, loopCompletesAtMs, sequenceIndexAt, sequenceLoopMs, timelineLoopMs, usePrefersReducedMotion, } from './homePlayback'
import ui from './HomeTab.module.css'
import type { Accessor } from 'solid-js'
import type { PlaybackCoordinator, PlaybackReason } from './homePlayback'
import type { RenderStatus } from '@/contexts/ComputeGateContext'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineTrack } from '@/utils/timeline'

/**
 * Home — Phase 2/3. One plate's worth of flame: a static poster with a LIVE GPU
 * render layered over it, which for an animated row can also play its timeline.
 *
 * "Live by default, poster on failure, freeze when done" — ported from the
 * landing's `PosterFlame`/`FlameView` pair (which cannot be imported here: the
 * landing depends on the app, not the other way round).
 *
 * The poster shows whenever the live render cannot run — no WebGPU, a lost
 * device, off-screen, mid-scroll, or not yet accumulated — and takes over for
 * good once the flame has converged (`freezeWhenConverged`), at which point the
 * canvas unmounts and its buffers are freed. That last part is the main cost
 * control: Home's plates are non-interactive, so a converged plate has no reason
 * to keep a WebGPU canvas alive when the poster is the same image.
 *
 * Three things here are load-bearing and easy to undo by accident; see
 * `.agents/skills/gallery_preview_layout`:
 *
 *  1. Mounting is gated on SETTLED visibility (`near() && !isScrolling()`).
 *     Mounting on raw intersection means a fast scroll allocates and abandons a
 *     canvas per plate that flickers past, and the abandoned buffers (freed only
 *     once pending GPU work finishes) balloon VRAM.
 *  2. Every plate is registered with the shared `<ComputeGate>`, which caps how
 *     many flames actually render at once. Mounted-but-not-allowed plates keep
 *     their accumulation (so progress is monotonic) but their render loop is
 *     parked at `renderInterval: Infinity`.
 *  3. The descriptor is fetched per plate, on demand. The list endpoint omits
 *     `flame` deliberately, and fetching all of them up front would pull every
 *     descriptor in the gallery for a page that may only ever show three.
 *
 * ## Playback (Phase 3)
 *
 * An animated plate normally sits frozen at its poster's frame. It ANIMATES
 * while it holds a slot from the page's `PlaybackCoordinator` — on hover, or
 * for one auto-play loop on arriving at the section (see homePlayback.ts for
 * the rules and the frame maths).
 *
 * The mechanism is a per-plate rAF clock feeding `applyTracksToFlame` into a
 * fresh clone of the row's rest-pose descriptor, which is what
 * `WelcomeScreen`'s hover-animated thumbnails already do. The workspace
 * mechanism — `Flam3 animationEnabled` + `applyTimelineToFlame` — is
 * unavailable here and would be wrong if it were: Flam3 reads the timeline from
 * `useTimeline()`, a context MainWorkspace provides for the ONE editor timeline
 * (one playhead, one config, one track set). Home renders outside that provider
 * (App.tsx mounts HomeTab as a sibling of MainWorkspace), every plate carries
 * its own tracks and its own poster frame, and the editor's playhead is
 * simultaneously driving the workspace canvas behind Home. So `animationEnabled`
 * stays false and the plate poses its own descriptor.
 *
 * Stopping is the part that has to be exact, and it is two different things:
 *
 *  - a run that COMPLETES (an auto-play loop, or the tail played out after the
 *    pointer left) clears the playhead, which drops the plate back to
 *    `poster_frame` — the same frame the poster was captured at — so the plate
 *    re-converges on the poster's own image and the freeze swaps in an
 *    identical picture;
 *  - a run that is merely INTERRUPTED (mid-scroll, a lost coordinator slot)
 *    holds its playhead, so the pointer coming back resumes rather than
 *    restarts. Nothing about it is a new run.
 *
 * ## Sequences (Phase 6)
 *
 * A row may carry an ordered list of extra descriptors (`gallery_items.
 * sequence`), and then playback is a WALK through `[flame, ...sequence]` rather
 * than a timeline: same clock, same coordinator, same rules, a different thing
 * being interpolated. That is what makes `cap-randomizer` show "roll a whole
 * flame, then steer it" instead of asserting it. Rows without one — every other
 * row — are untouched.
 */

/**
 * Backing-store size per placement, all 16:9 — the same aspect the posters are
 * captured at (1600x900, see scripts/capture-gallery-posters.mjs). Paired with
 * `object-fit: cover` on the canvas this makes the live render and the poster
 * the SAME framing, so the poster cross-fade and the freeze-to-poster swap have
 * nothing to jump between. Rendering at the plate's own aspect instead would
 * reframe the flame (Camera2D fixes the vertical extent and widens horizontally,
 * while `object-fit: cover` crops vertically) and every freeze would visibly
 * shift.
 *
 * These are fixed rather than element-derived so per-plate VRAM is a known
 * quantity: Flam3 allocates 36 bytes of accumulation/postprocess/filter buffers
 * per pixel, so a plate costs ~8 MiB and the hero ~33 MiB regardless of viewport.
 */
const RESOLUTIONS = {
  hero: { width: 1280, height: 720 },
  plate: { width: 640, height: 360 },
  thumb: { width: 448, height: 252 },
} as const

export type HomeFlamePlacement = keyof typeof RESOLUTIONS

/**
 * Convergence target. Matches `capture-gallery-posters.mjs --quality` (0.97), so
 * a live plate settles on the poster's own look rather than a cleaner or noisier
 * version of it.
 */
const HOME_FLAME_QUALITY = 0.97

/**
 * Freeze at this fraction of the point target. The last couple of percent are
 * visually indistinguishable (0.97 target vs ~0.9697 reached) and waiting for
 * the exact limit would depend on where Flam3's final batch happens to land.
 */
const FREEZE_PROGRESS_FRACTION = 0.98

/** Fraction of the point target past which a plate stops being "fresh". */
const HIGH_QUALITY_PROGRESS = 0.5

/** Per-flame point budget for the mobile / low tier. */
const POINT_BUDGET_TOUCH = 1e5
/** Per-flame point budget for the desktop / high tier. */
const POINT_BUDGET_DESKTOP = 1e6

/**
 * Per-placement cap on top of the device budget. `pointCountPerBatch` sizes the
 * per-flame chain-state buffers at 32 bytes each, so the desktop budget is ~32
 * MiB — fine for one hero, far too much multiplied by every plate near the
 * viewport. Mirrors GALLERY_PREVIEW_POINT_COUNT's reasoning in defaults.ts.
 */
const POINT_CAP: Record<HomeFlamePlacement, number> = {
  hero: Infinity,
  plate: 2e5,
  thumb: 1e5,
}

let cachedDeviceBudget: number | undefined

/**
 * Coarse device tier for the chaos-game batch size (the app-side equivalent of
 * the landing's `devicePointBudget`). Tiers on TOUCH rather than screen size: a
 * large tablet reports a desktop-sized viewport with a mobile-class GPU, so any
 * touch device gets the small budget and only a no-touch device gets the large
 * one.
 */
function devicePointBudget(): number {
  if (cachedDeviceBudget !== undefined) {
    return cachedDeviceBudget
  }
  const touch = (globalThis.navigator?.maxTouchPoints ?? 0) > 0
  cachedDeviceBudget = touch ? POINT_BUDGET_TOUCH : POINT_BUDGET_DESKTOP
  return cachedDeviceBudget
}

function pointBudgetFor(placement: HomeFlamePlacement): number {
  return Math.min(devicePointBudget(), POINT_CAP[placement])
}

/** Everything a plate needs to pose one gallery row at an arbitrary frame. */
interface GalleryFlame {
  /**
   * The row's REST-POSE descriptor. Never mutated and shared by every plate
   * showing this slug, so each plate poses a clone of it (see `posedFlame`)
   * rather than writing tracks into this one.
   */
  flame: FlameDescriptor
  /** The row's timeline, or empty for a still. */
  tracks: TimelineTrack[]
  /**
   * Frame the POSTER was captured at — the frame this plate rests on, and the
   * frame every playback run starts from and lands back on.
   *
   * Not frame 0: the capture page samples a fraction into the timeline and
   * slides off that frame when it lands on a vibrancy dip (see
   * scripts/posterCapture.tsx), and `poster_frame` is what records the result.
   * Posing here is what makes the live render and the poster the same image,
   * and the freeze-to-poster swap invisible.
   *
   * `undefined` leaves the flame at its rest pose, which is safe: the only such
   * rows that reach here have no poster to disagree with, because
   * `needsPosterFrame` keeps the ones that do from going live at all.
   */
  posterFrame: number | undefined
  /** Last keyframe — one playback loop. 0 for a still. */
  endFrame: number
  /**
   * Extra descriptors this row plays through, in order — empty for every row
   * that is one flame, which is all of them but `cap-randomizer`.
   *
   * The plate walks `[flame, ...sequence]`: index 0 is the row's own flame, so
   * a run always begins and ends on the image the poster was captured from,
   * exactly as a timeline run begins and ends on `posterFrame`.
   */
  sequence: FlameDescriptor[]
}

/**
 * Rows already fetched this session, by slug. Scrolling a plate out of view and
 * back must not re-fetch it, and the same flame can appear in more than one
 * section. Rejections are evicted so a transient failure does not poison the
 * slug for the rest of the session.
 *
 * Deliberately NOT shared with HomeTab's "open in the workspace" path: that
 * hands the descriptor to the editor, which owns and mutates it from then on
 * and must not be handed the same object a plate is rendering.
 */
const descriptorCache = new Map<string, Promise<GalleryFlame>>()

/**
 * The entries of a curated sequence this build can actually render.
 *
 * Validated one by one rather than as a batch: a sequence is generated content
 * written by a script into a column the app reads months later, so the failure
 * to design for is "one entry is stale", and dropping the whole walk for it
 * would take the card's whole point away. A shorter walk is still a walk.
 */
function validSequence(slug: string, stored: FlameDescriptor[]) {
  const usable: FlameDescriptor[] = []
  for (const [index, entry] of stored.entries()) {
    try {
      usable.push(validateFlame(entry))
    } catch (err) {
      console.error(`Home: sequence[${index}] of '${slug}' is unusable:`, err)
    }
  }
  return usable
}

function loadDescriptor(slug: string): Promise<GalleryFlame> {
  const cached = descriptorCache.get(slug)
  if (cached !== undefined) {
    return cached
  }
  // Validated exactly as the poster capture validates it, so a live plate can
  // never render from a descriptor the app itself would reject.
  const pending = fetchGalleryItem(slug)
    .then((item) => {
      const tracks = item.animation?.tracks ?? []
      return {
        flame: validateFlame(item.flame),
        tracks,
        posterFrame: item.poster_frame ?? undefined,
        endFrame: getUserEndFrame(tracks, 0),
        sequence: validSequence(item.slug, sequenceFlames(item)),
      }
    })
    .catch((err: unknown) => {
      descriptorCache.delete(slug)
      throw err
    })
  descriptorCache.set(slug, pending)
  return pending
}

/**
 * Dev-only: keep every plate live instead of freezing to its poster. In devtools
 * run `__chaosHomeNoFreeze()`.
 *
 * A plate converges in a couple of GPU ticks, so the live phase is normally over
 * before it can be looked at — which is the point (the poster is the same image)
 * but leaves no way to check that claim. Holding the plates live is how you
 * compare the live render against the poster it replaces, and how you eyeball a
 * live plate at all. Stripped from production builds by DEV dead-code
 * elimination, exactly like `__chaosForceGpuUnavailable` in lib/gpuStatus.ts.
 */
const [noFreeze, setNoFreeze] = createSignal(false)

if (import.meta.env.DEV) {
  ;(
    globalThis as typeof globalThis & { __chaosHomeNoFreeze?: () => void }
  ).__chaosHomeNoFreeze = () => {
    setNoFreeze(true)
  }
}

export interface HomeFlameProps {
  slug: string
  /** Captured poster, or undefined for a row that has none yet. */
  poster?: string
  placement: HomeFlamePlacement
  /**
   * True while this plate is within (or near) Home's scroll container — from the
   * one shared IntersectionObserver in HomeTab, rooted on the scroll container
   * rather than the viewport so `rootMargin` can actually preload past the fold.
   */
  near: Accessor<boolean>
  /** Hover: raises this plate's ComputeGate priority so it renders first. */
  hovered?: Accessor<boolean>
  /**
   * Never go live; show the poster only. For rows whose poster this plate cannot
   * reproduce — see `needsPosterFrame` in lib/galleryContent.ts, which is the
   * one thing that should be deciding this. Today that is an animated row whose
   * poster was captured before `poster_frame` existed: its frame is unknown, so
   * a live render would be a different image and every freeze would jump.
   *
   * Animated rows in general are NOT poster-only: with the frame recorded, this
   * plate renders the timeline at exactly that frame (see `loadDescriptor`).
   */
  posterOnly?: boolean
  /**
   * Unmount the live render once converged and keep the poster (the same image,
   * zero ongoing GPU). Only for non-interactive plates.
   */
  freezeWhenConverged?: boolean
  /**
   * The page's playback budget. Without one a plate never animates — an
   * animated row simply rests at its poster frame, which is what every section
   * other than "In motion" wants by default.
   */
  playback?: PlaybackCoordinator
  /**
   * Play one loop on arriving in view, without being asked. Honoured only for
   * an animated row, and never under `prefers-reduced-motion`. Re-arms when the
   * plate leaves Home's near-window, so coming back to the section plays again.
   */
  autoPlay?: boolean
  /** Reactive: is this plate animating right now? For the caller's affordance. */
  onPlayingChange?: (playing: boolean) => void
}

export function HomeFlame(props: HomeFlameProps) {
  const scrolling = useIsScrolling()
  /**
   * Settled visibility: on/near screen AND not mid-scroll. Mounting on raw
   * intersection is the VRAM-balloon failure mode described in isScrolling.ts —
   * while the user scrolls we mount nothing new, and ~180ms after the last
   * scroll event the visible window mounts and renders.
   */
  const settled = createMemo(() => props.near() && !scrolling())

  const [frozen, setFrozen] = createSignal(false)
  const [row, setRow] = createSignal<GalleryFlame>()
  const [points, setPoints] = createSignal(0)
  const [pointLimit, setPointLimit] = createSignal<() => number>()
  /**
   * Where the playhead is: a timeline FRAME for an animated row, an index into
   * the walk for a sequence row. `undefined` is "at rest", which for both means
   * the image the poster was captured from.
   */
  const [playPos, setPlayPos] = createSignal<number>()

  const wantsLive = createMemo(
    () => props.posterOnly !== true && gpuReady() && settled() && !frozen(),
  )

  /**
   * Fetch the descriptor the first time this plate is about to go live, never up
   * front — the list endpoint omits `flame` precisely so Home does not pull
   * every descriptor in the gallery to draw posters. A plain flag rather than a
   * signal: a slug's descriptor is immutable, so one request per plate is all
   * there will ever be.
   */
  let requested = false
  createEffect(() => {
    if (!wantsLive() || requested) {
      return
    }
    requested = true
    const slug = props.slug
    void loadDescriptor(slug).then(
      (loaded) => {
        setRow(loaded)
      },
      (err: unknown) => {
        // The poster stays: a plate that cannot fetch its flame is still a plate.
        // Re-arm so scrolling back retries — a network blip must not disable this
        // plate's live render for the rest of the session.
        requested = false
        console.error(`Home: no live flame for '${slug}':`, err)
      },
    )
  })

  /**
   * Progress towards convergence, 0..1+, from THIS plate's own counters.
   *
   * Deliberately not Flam3's `setCurrentQuality` getter: that divides by the
   * module-global `accumulatedPointCount`, which only the main workspace renderer
   * writes (`isExportRenderer`). Home sits on top of a still-mounted workspace,
   * so that global reads as the editor's point count and every plate would look
   * converged the instant it mounted. `onAccumulatedPointCount` and
   * `setQualityPointCountLimit` are both per-instance.
   */
  const progress = createMemo(() => {
    const limit = pointLimit()?.()
    if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
      return 0
    }
    return points() / limit
  })

  const renderStatus = createMemo<RenderStatus>(() => {
    const p = progress()
    if (p >= 1) {
      return 'done'
    }
    return p >= HIGH_QUALITY_PROGRESS ? 'high-quality' : 'low-quality'
  })

  /**
   * Mount while settled-visible and unmount when scrolled away, so concurrent
   * WebGPU canvases stay bounded to the on-screen window. Mounting is gated on
   * visibility rather than on `allowed()`: a plate that lost its gate slot keeps
   * its accumulation buffers (parked, not rendering) so progress is monotonic,
   * instead of throwing the work away and restarting from zero every rotation.
   */
  const live = createMemo(() => wantsLive() && row() !== undefined)

  // ── Playback ────────────────────────────────────────────────────────────
  // See homePlayback.ts for the rules; this is the plumbing.

  const reducedMotion = usePrefersReducedMotion()

  /**
   * How this row plays, if it plays at all.
   *
   * A row with a curated `sequence` walks it; otherwise a row with keyframes
   * plays its timeline. Sequence first because the two answer different
   * questions and only one row has both available in principle — "which flames"
   * is a stronger statement than "which frames", and a curated walk is
   * something a person chose.
   */
  const playMode = createMemo<'sequence' | 'timeline' | 'still'>(() => {
    const current = row()
    if (current === undefined) {
      return 'still'
    }
    if (current.sequence.length > 0) {
      return 'sequence'
    }
    return current.tracks.length > 0 ? 'timeline' : 'still'
  })

  /** Wall-clock length of one whole run, and 0 for a row that cannot play. */
  const loopMs = createMemo(() => {
    const current = row()
    if (current === undefined) {
      return 0
    }
    switch (playMode()) {
      case 'sequence':
        return sequenceLoopMs(current.sequence.length + 1)
      case 'timeline':
        return timelineLoopMs(current.endFrame)
      default:
        return 0
    }
  })

  /**
   * Could this plate animate if it were asked to? A playable row, on/near
   * screen, not mid-scroll, with a working GPU and a descriptor in hand — which
   * is how "scrolling away stops playback" and the settled-visibility rule
   * survive Phase 3.
   *
   * Deliberately NOT `live()`: a plate freezes back to its poster within a
   * couple of GPU ticks, and `live()` is false the moment it does. Requiring it
   * here would be a cycle — frozen ⇒ not live ⇒ cannot want playback ⇒ nothing
   * clears the freeze ⇒ hovering an animated plate did nothing at all. Wanting
   * playback is what thaws it (`canFreeze` drops, the freeze effect clears
   * `frozen`, `live()` comes back), so the dependency has to run this way round.
   */
  const canPlay = createMemo(
    () =>
      props.posterOnly !== true &&
      gpuReady() &&
      settled() &&
      playMode() !== 'still',
  )

  const hovered = createMemo(() => props.hovered?.() === true)

  /**
   * Auto-play is a one-shot per arrival. `autoArmed` is a plain variable rather
   * than a signal on purpose: it must not be a dependency of the effect that
   * consumes it, or disarming would immediately re-run it.
   */
  let autoArmed = true
  const [autoRunning, setAutoRunning] = createSignal(false)
  /** True while a run with no reason left is playing out the rest of its loop. */
  const [finishing, setFinishing] = createSignal(false)

  /**
   * The run clock, in ms. A plain variable and not a signal: it changes on
   * every animation frame and nothing renders from it directly (the quantised
   * `playPos` is what the view reads), so making it reactive would only add
   * recomputations.
   *
   * It SURVIVES a stop. That is the whole of "re-entering a plate must not
   * restart it": losing the pointer, losing a coordinator slot or a scroll all
   * leave the clock where it was, and the next run continues from there. Only
   * a completed run or leaving the near-window puts it back to zero.
   */
  let elapsed = 0
  /** When the current run should land, or undefined for "as long as asked". */
  let stopAt: number | undefined

  /** Back to rest: the poster's own frame, and nothing pending. */
  function resetRun() {
    elapsed = 0
    stopAt = undefined
    setPlayPos(undefined)
    setFinishing(false)
    setAutoRunning(false)
  }

  // Leaving Home's near-window is a real departure (the observer's margin is
  // 300px), so coming back counts as arriving at the section again — and is the
  // one thing besides a completed run that rewinds the clock.
  createEffect(() => {
    if (!props.near()) {
      autoArmed = true
      resetRun()
    }
  })

  createEffect(() => {
    if (
      props.autoPlay !== true ||
      reducedMotion() ||
      !canPlay() ||
      !autoArmed
    ) {
      return
    }
    autoArmed = false
    stopAt = Math.min(untrack(loopMs), AUTO_PLAY_MAX_MS)
    setAutoRunning(true)
  })

  /**
   * The pointer takes over from the greeting, page-wide.
   *
   * Without this, a page capped at two playback slots means pointing at a third
   * plate preempts one that is mid-loop — a plate the user is NOT pointing at
   * stops dead, which is what "hovering appears to affect other tiles" was.
   * Retiring auto-play instead makes the hand-over deliberate and visible once,
   * rather than arbitrary and repeated.
   */
  createEffect(() => {
    if (props.playback?.pointerActive() === true) {
      autoArmed = false
      setAutoRunning(false)
    }
  })

  /**
   * Hover ends: play out the rest of the loop instead of cutting.
   *
   * Stopping the instant the pointer leaves would freeze the plate on an
   * arbitrary frame and then snap it to its poster; carrying on to the end of
   * the loop lands it on the poster's own image. It is also what makes a
   * pointer sweeping back and forth harmless — it finds the same run still
   * going and simply keeps it, which is what `stopAt` being cleared on the way
   * IN is for.
   */
  createEffect(
    on(hovered, (isHovered, wasHovered) => {
      if (isHovered) {
        stopAt = undefined
        setFinishing(false)
        return
      }
      if (wasHovered !== true) {
        return
      }
      const target = loopCompletesAtMs(elapsed, untrack(loopMs))
      if (target <= elapsed) {
        // Already landed — a pointer that crossed a corner, or a run that
        // finished under the pointer. Nothing left to play out.
        resetRun()
        return
      }
      stopAt = target
      setFinishing(true)
    }),
  )

  /** What this plate is asking the coordinator for, if anything. */
  const wants = createMemo<PlaybackReason | undefined>(() => {
    if (!canPlay()) {
      return undefined
    }
    if (hovered()) {
      return 'hover'
    }
    if (finishing()) {
      return 'finishing'
    }
    return autoRunning() ? 'auto' : undefined
  })

  const playbackToken = Symbol('home-playback')
  createEffect(() => {
    const coordinator = props.playback
    if (coordinator === undefined) {
      return
    }
    const reason = wants()
    if (reason === undefined) {
      coordinator.release(playbackToken)
    } else {
      coordinator.request(playbackToken, reason)
    }
  })
  onCleanup(() => {
    props.playback?.release(playbackToken)
  })

  /**
   * Asking is not playing: the coordinator caps the whole page at
   * MAX_CONCURRENT_PLAYBACK, so a plate that wants to animate may have to wait
   * or be preempted. Losing the slot stops the run exactly as scrolling away
   * does.
   */
  const playing = createMemo(
    () =>
      wants() !== undefined &&
      (props.playback?.isGranted(playbackToken) ?? false),
  )

  createEffect(() => {
    props.onPlayingChange?.(playing())
  })

  /**
   * The rAF clock. Elapsed-time based (not a tick counter) so a plate that
   * misses frames still lands back on its poster frame at the right moment.
   *
   * It tracks `playing()` and NOTHING else on purpose. It used to read
   * `wants()` to decide whether the run was an auto-play one, which meant the
   * pointer arriving on a plate mid-run changed the reason, re-ran this effect,
   * and restarted the animation from the poster frame under the user's cursor —
   * the reported "hovering restarts the tile". Why the run is happening is now
   * read inside the tick, where reading it is not a subscription.
   */
  createEffect(() => {
    if (!playing()) {
      return
    }
    const current = untrack(row)
    if (current === undefined) {
      return
    }
    const walk = current.sequence.length + 1
    const sequenced = untrack(playMode) === 'sequence'
    const start = current.posterFrame ?? 0
    // Resume, not restart: the clock carries over from the last run, so a
    // pointer that leaves and comes back continues where it was.
    const startedAt = globalThis.performance.now() - elapsed
    let handle = requestAnimationFrame(function tick() {
      const now = globalThis.performance.now() - startedAt
      // A hovered plate never lands: the pointer is an open-ended request, and
      // an auto-play cap or a queued landing must not stop a plate the user is
      // actively pointing at.
      if (stopAt !== undefined && now >= stopAt && !hovered()) {
        resetRun()
        return
      }
      elapsed = now
      setPlayPos(
        sequenced
          ? sequenceIndexAt(now, walk)
          : frameAtElapsed(start, current.endFrame, now),
      )
      handle = requestAnimationFrame(tick)
    })
    onCleanup(() => {
      cancelAnimationFrame(handle)
      // The playhead is deliberately NOT cleared here. Losing a slot, a scroll
      // or a lost GPU is a PAUSE — the plate holds the frame it reached and the
      // next run continues from it. Landing back on the poster frame is the job
      // of `resetRun`, which runs when a loop completes or the plate leaves the
      // near-window; both of those land on the poster's own image, which is
      // what keeps the freeze-to-poster swap invisible.
    })
  })

  /**
   * The descriptor to render.
   *
   * Three shapes, one memo: a still row's own flame; the entry a curated
   * sequence's walk is on (index 0 being the row's own flame, so a run starts
   * and ends on the poster's image); or a clone of the row posed at the current
   * timeline frame.
   *
   * Cloning per frame rather than mutating the cached row is not optional — the
   * cache is shared by every plate showing this slug, and `applyTracksToFlame`
   * writes in place. Sequence entries are handed over as they are, because
   * nothing poses them. At rest the memo has no reactive reason to recompute,
   * and during playback `frameAtElapsed` quantises to whole frames, so a 120Hz
   * display still only clones 30 times a second.
   */
  const posedFlame = createMemo(() => {
    const current = row()
    if (current === undefined) {
      return undefined
    }
    if (current.sequence.length > 0) {
      const index = playPos() ?? 0
      return index <= 0
        ? current.flame
        : (current.sequence[index - 1] ?? current.flame)
    }
    if (current.tracks.length === 0) {
      return current.flame
    }
    const frame = playPos() ?? current.posterFrame
    if (frame === undefined) {
      return current.flame
    }
    const posed = deepClone(current.flame)
    // No loop options, matching scripts/posterCapture.tsx: the stored envelope
    // is `{ tracks }` only, so keyframes resolve on their own timeline exactly
    // as the capture resolved them.
    applyTracksToFlame(current.tracks, posed, frame)
    return posed
  })

  const liveFlame = createMemo(() => (live() ? posedFlame() : undefined))

  /**
   * Register with Home's shared ComputeGate — but only once this plate has
   * something to render. An undefined state is excluded from the ranking
   * altogether, so poster-only rows and frozen plates never hold a slot.
   *
   * An animating plate counts as selected: it is the one thing on the page that
   * is visibly moving, so it must win a slot over a still plate quietly topping
   * up its accumulation. The concurrency cap makes that safe — at most
   * MAX_CONCURRENT_PLAYBACK plates can claim the priority at once, which is the
   * gate's own capacity.
   */
  const allowed = useComputeGate(() =>
    props.posterOnly === true || frozen() || row() === undefined
      ? undefined
      : {
          isVisible: settled(),
          renderStatus: renderStatus(),
          isSelected: hovered() || playing(),
        },
  )

  /**
   * Freezing means "hand the picture back to the poster", so a row with no
   * poster captured yet must stay live — otherwise converging would replace the
   * flame with an empty plate. An animating plate must not freeze either: it
   * would swap a moving flame for a still poster mid-loop. `noFreeze()` is the
   * dev-only escape hatch used to check that a frozen plate and its poster
   * really are the same image.
   *
   * A PAUSED plate — one holding a mid-run frame because it lost its slot or
   * the page is mid-scroll — must not freeze either, and that is what
   * `playPos()` rules out. It is not playing, but the picture on it is not the
   * poster's, so handing over would be the visible jump the whole freeze design
   * exists to avoid.
   */
  const canFreeze = createMemo(
    () =>
      props.freezeWhenConverged === true &&
      props.poster !== undefined &&
      !noFreeze() &&
      !playing() &&
      playPos() === undefined,
  )

  // Re-arm the poster whenever the live render stops (scrolled away, GPU lost),
  // so a re-mounted plate cross-fades from the poster again instead of revealing
  // a blank canvas that a stale point count claims is ready.
  createEffect(() => {
    if (!live()) {
      setPoints(0)
    }
  })

  createEffect(() => {
    if (!canFreeze()) {
      // Thaw: the dev hook was flipped, this row has no poster to hand the
      // picture back to, or it is animating — so it must stay live.
      setFrozen(false)
      return
    }
    if (live() && progress() >= FREEZE_PROGRESS_FRACTION) {
      setFrozen(true)
    }
  })

  /** The live canvas has something on it worth revealing the poster for. */
  const liveShowing = createMemo(() => live() && points() > 0)

  // One token per plate; membership in the live set == this plate's canvas is
  // mounted. Idempotent, so the DebugPanel's count cannot drift.
  const previewToken = Symbol('home-flame')
  createEffect(() => {
    const isLive = live()
    setLivePreviewLive(previewToken, isLive)
    if (isLive) {
      vramLog(
        `[HomeFlame] MOUNT '${props.slug}' (${props.placement})` +
          ` allowed=${allowed()} near=${props.near()}`,
      )
    }
  })
  onCleanup(() => {
    setLivePreviewLive(previewToken, false)
  })

  const resolution = createMemo(() => RESOLUTIONS[props.placement])
  const pointCount = createMemo(() => pointBudgetFor(props.placement))
  // Hoisted out of the JSX prop on purpose — see the note in LiveFlame.
  const renderInterval = createMemo(() => (allowed() ? 1 : Infinity))

  return (
    <>
      <Show when={props.poster}>
        {(src) => (
          <img
            class={ui.flamePoster}
            classList={{
              [ui.isHidden!]: liveShowing(),
              [ui.isFrozen!]: frozen(),
            }}
            src={src()}
            alt=""
            aria-hidden="true"
            loading="lazy"
            draggable={false}
          />
        )}
      </Show>
      {/* NOT `keyed`: an animating plate hands down a freshly posed clone every
          frame, and a keyed Show would tear down and rebuild the canvas — and
          its WebGPU buffers — 30 times a second. Unkeyed, the callback's
          accessor stays stable across value changes and only the falsy↔truthy
          transition remounts, which is exactly the mount/unmount boundary the
          visibility gating wants. */}
      <Show when={liveFlame()}>
        {(descriptor) => (
          <LiveFlame
            flame={descriptor()}
            resolution={resolution()}
            pointCountPerBatch={pointCount()}
            renderInterval={renderInterval()}
            onPoints={setPoints}
            onPointLimit={(get) => {
              setPointLimit(() => get)
            }}
          />
        )}
      </Show>
    </>
  )
}

/**
 * The live surface: the app's own AutoCanvas + preview camera + Flam3, with NO
 * `Root` of its own. Home renders inside App's `<Root>` (App.tsx), so the WebGPU
 * device comes from there; adding a Root per plate — as the landing must, having
 * no app Root — would be redundant here.
 */
function LiveFlame(props: {
  flame: FlameDescriptor
  resolution: { width: number; height: number }
  pointCountPerBatch: number
  renderInterval: number
  onPoints: (count: number) => void
  onPointLimit: (get: () => number) => void
}) {
  // Every conditional (`??`, ternary, `&&`) that feeds Flam3 or a camera is
  // hoisted into a memo owned by this component and passed as the CALLED value.
  // Written directly in a JSX prop, a conditional compiles to a lazily-created
  // memo whose first reader is Flam3's requestAnimationFrame loop — an ownerless
  // context — so Solid warns that the computation was "created outside a
  // createRoot" and will never be disposed. The memos below live in this
  // component's owner and are disposed with it.
  // See memory: solid-conditional-prop-memo-leak.
  const is3D = createMemo(
    () => (props.flame.renderSettings.dimensions ?? 2) === 3,
  )
  const cameraPosition = createMemo(() =>
    vec2f(...props.flame.renderSettings.camera.position),
  )
  const cameraZoom = createMemo(() => props.flame.renderSettings.camera.zoom)
  const camera3D = createMemo(() => props.flame.renderSettings.camera3D)
  const edgeFadeColor = createMemo(() => vec4f(0))

  const flam3 = () => (
    <Flam3
      animationEnabled={false}
      quality={HOME_FLAME_QUALITY}
      pointCountPerBatch={props.pointCountPerBatch}
      // The posters are captured with the adaptive filter on, so the live plate
      // needs it too or a converged plate is visibly grainier than the image it
      // replaced.
      adaptiveFilterEnabled={true}
      flameDescriptor={props.flame}
      renderInterval={props.renderInterval}
      edgeFadeColor={edgeFadeColor()}
      onAccumulatedPointCount={props.onPoints}
      setQualityPointCountLimit={props.onPointLimit}
    />
  )

  return (
    <AutoCanvas
      class={ui.flameCanvas}
      pixelRatio={1}
      fixedResolution={props.resolution}
    >
      <Show
        when={is3D()}
        fallback={
          <Camera2D position={cameraPosition()} zoom={cameraZoom()}>
            {flam3()}
          </Camera2D>
        }
      >
        <Default3DPreviewCamera camera3D={camera3D()}>
          {flam3()}
        </Default3DPreviewCamera>
      </Show>
    </AutoCanvas>
  )
}
