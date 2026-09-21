/**
 * The live driver — the only file in `flame/glide/` that knows about the app.
 *
 * Everything else here is pure and takes no dependency on Solid, the GPU or a
 * store. This file owns the clock: a requestAnimationFrame loop that samples a
 * plan and writes intermediates through the workspace's SILENT write path, the
 * same one the animation export already uses, so a glide never lands on the
 * undo stack and never reaches the session recorder.
 *
 * The shape follows what the prior art got right and nothing else: one call to
 * start, one boolean to observe, one call to abort. Callers never think about
 * frames.
 *
 * It is a factory rather than workspace code so the workspace's own file grows
 * by construct-and-provide and nothing more (HM1 in the plan) — and so the same
 * driver can be mounted from a hook in the fork's decomposed workspace.
 */

import { createSignal } from 'solid-js'
import { isRecordingSuppressed } from '@/recorder/recorder'
import { planGlide } from './plan'
import { resolveGlideQuality } from './quality'
import { sampleGlide } from './sample'
import { GLIDE_DEADLINE_SLACK_MS, isGlideRefusal } from './types'
import type { GlideOptions, GlideOutcome, GlidePlan, GlideQuality, GlideQualityPreference, } from './types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * The global "animate changes" mode, off by default.
 *
 * Module state, like the recorder's own `isSessionRecording`: the commands, the
 * agent surface and the replay panel all have to read the same switch, and
 * threading it through every caller would be a prop drilled six levels for a
 * boolean.
 */
const [glideEnabled, setGlideEnabled] = createSignal(false)
export { glideEnabled, setGlideEnabled }

/** The quality-tier override. `auto` derives it from the quality preset. */
const [glideQualityPreference, setGlideQualityPreference] =
  createSignal<GlideQualityPreference>('auto')
export { glideQualityPreference, setGlideQualityPreference }

export type GlideRuntimeDeps = {
  readFlame: () => FlameDescriptor
  /** Replace the document WITHOUT recording history. */
  writeFlame: (flame: FlameDescriptor) => void
  /** The workspace's quality preset key, for `quality: 'auto'`. */
  qualityPreset?: () => string
  /**
   * Identify the document's newest history entry, called as a transition
   * starts. A transition that follows a document change is presenting that
   * entry, and this is how a cut-short one says WHICH entry it was showing.
   */
  markDocumentEntry?: () => number | null
  /**
   * The transition was cut short and the document is staying on the frame it
   * reached, so the entry it was presenting has to end there instead of on
   * `recordedEnd` — otherwise undo is exact only by luck and redo puts the
   * viewer on a flame they interrupted to avoid. The host decides whether the
   * marked entry is still the one to rewrite.
   */
  amendDocumentEntry?: (
    mark: number | null,
    recordedEnd: FlameDescriptor,
  ) => void
  /** Told the tier while a glide runs, and `undefined` once it settles. */
  onQualityChange?: (quality: GlideQuality | undefined) => void
  now?: () => number
  requestFrame?: (callback: (time: number) => void) => number
  cancelFrame?: (handle: number) => void
}

export type GlideRuntime = {
  isGliding: () => boolean
  /** The tier a glide would run at right now, preference and preset resolved. */
  quality: () => GlideQuality
  /** The plan being played, for anything that wants to read its notes. */
  activePlan: () => GlidePlan | undefined
  activeQuality: () => GlideQuality | undefined
  /**
   * Settle whatever is in flight and hand back the flame the viewer could see
   * a moment ago.
   *
   * This is the retarget seam. A change arriving mid-glide must be applied to
   * the SETTLED document — applying it to a half-interpolated one would bake
   * an intermediate into the result — while the animation that follows should
   * start where the eye already is rather than jumping to the settle first.
   * Callers take the returned flame as the next glide's starting point.
   */
  settleForNextChange: () => FlameDescriptor | undefined
  /**
   * Animate from `from` to whatever is in the store right now.
   *
   * Always settles within the glide's own duration plus
   * `GLIDE_DEADLINE_SLACK_MS`, whatever the animation clock does, and the
   * outcome says which clock got it there.
   */
  glideFrom: (
    from: FlameDescriptor,
    options?: GlideOptions,
  ) => Promise<GlideOutcome | undefined>
  /** Animate from the store to `target`, landing exactly on `target`. */
  glideTo: (
    target: FlameDescriptor,
    options?: GlideOptions,
  ) => Promise<GlideOutcome | undefined>
  /**
   * A write this runtime did not make has reached the document.
   *
   * Stop where we are and let it win: no settle, no jump to the target. A
   * glide is presentation, and a person editing the flame they can see is not
   * something to animate over — the frame on screen is the one they meant to
   * change. Callers that ARE a change (a command, a replay step) settle first
   * with `settleForNextChange` instead, and so never reach this.
   */
  noteForeignWrite: () => void
  /** Stop and leave the document on the frame it reached. */
  cancel: () => void
  /** Stop and land on the settle now. */
  finish: () => void
  dispose: () => void
}

type ActiveGlide = {
  plan: GlidePlan
  startedAt: number
  /** The document's newest history entry when this started. */
  mark: number | null
  resolve: (outcome: GlideOutcome | undefined) => void
}

export function createGlideRuntime(deps: GlideRuntimeDeps): GlideRuntime {
  const now = deps.now ?? (() => globalThis.performance.now())
  const requestFrame =
    deps.requestFrame ??
    ((callback) => globalThis.requestAnimationFrame(callback))
  const cancelFrame =
    deps.cancelFrame ??
    ((handle) => {
      cancelAnimationFrame(handle)
    })

  const [active, setActive] = createSignal<ActiveGlide | undefined>()
  let frameHandle: number | undefined
  let deadlineHandle: ReturnType<typeof setTimeout> | undefined
  /** Depth, not a boolean: what makes `noteForeignWrite` mean FOREIGN. A host
   *  that routes its writes through a hook that calls back here must not have
   *  the runtime cancel itself on its own frames. */
  let ownWriteDepth = 0

  function writeFlame(flame: FlameDescriptor) {
    ownWriteDepth++
    try {
      deps.writeFlame(flame)
    } finally {
      ownWriteDepth--
    }
  }

  function stopClock() {
    if (frameHandle !== undefined) cancelFrame(frameHandle)
    frameHandle = undefined
    if (deadlineHandle !== undefined) clearTimeout(deadlineHandle)
    deadlineHandle = undefined
  }

  function release(landOnSettle: boolean, completedByDeadline = false) {
    const current = active()
    stopClock()
    setActive(undefined)
    deps.onQualityChange?.(undefined)
    if (!current) return
    if (landOnSettle) writeFlame(current.plan.settle)
    current.resolve({ plan: current.plan, completedByDeadline })
  }

  function tick() {
    const current = active()
    if (!current) return
    const elapsed = now() - current.startedAt
    const t =
      current.plan.durationMs <= 0 ? 1 : elapsed / current.plan.durationMs
    if (t >= 1) {
      // Always settle at full quality: the frame a viewer stops on must not be
      // the noisy one, in every tier.
      release(true)
      return
    }
    writeFlame(sampleGlide(current.plan, t))
    frameHandle = requestFrame(tick)
  }

  function start(
    from: FlameDescriptor,
    to: FlameDescriptor,
    options: GlideOptions,
  ): Promise<GlideOutcome | undefined> {
    const planned = planGlide(from, to, {
      ...options,
      quality: options.quality ?? glideQualityPreference(),
      qualityPreset: options.qualityPreset ?? deps.qualityPreset?.(),
    })
    if (isGlideRefusal(planned)) {
      // A refusal is not a failure to change the document: the change still
      // happens, it just happens at once.
      writeFlame(to)
      return Promise.resolve(undefined)
    }
    if (planned.durationMs <= 0 || planned.channels.length === 0) {
      writeFlame(planned.settle)
      return Promise.resolve({ plan: planned, completedByDeadline: false })
    }
    return new Promise<GlideOutcome | undefined>((resolve) => {
      setActive({
        plan: planned,
        startedAt: now(),
        mark: deps.markDocumentEntry?.() ?? null,
        resolve,
      })
      deps.onQualityChange?.(planned.quality)
      writeFlame(sampleGlide(planned, 0))
      frameHandle = requestFrame(tick)
      // The wall clock, which a hidden tab still runs. rAF is the animation
      // clock and Chrome simply stops calling it back when the tab is not
      // visible, so without this a glide — and any caller awaiting it — waits
      // for the viewer to come back to the tab. Landing on the settle is the
      // right answer there: the document must reach the state the change
      // asked for whether or not anyone watched it arrive.
      deadlineHandle = setTimeout(() => {
        deadlineHandle = undefined
        release(true, true)
      }, planned.durationMs + GLIDE_DEADLINE_SLACK_MS)
    })
  }

  return {
    isGliding: () => active() !== undefined,
    quality: () =>
      resolveGlideQuality(glideQualityPreference(), deps.qualityPreset?.()),
    activePlan: () => active()?.plan,
    activeQuality: () => active()?.plan.quality,
    settleForNextChange() {
      const current = active()
      if (!current) return undefined
      const visible = deps.readFlame()
      release(true)
      return visible
    },
    glideFrom(from, options = {}) {
      return start(from, deps.readFlame(), options)
    },
    glideTo(target, options = {}) {
      return start(deps.readFlame(), target, options)
    },
    noteForeignWrite() {
      if (ownWriteDepth > 0) return
      const current = active()
      if (current) {
        // The document is staying here, so the entry that was being presented
        // has to say so — before the write that interrupted it lands, which is
        // why the host calls this from its before-write hook.
        deps.amendDocumentEntry?.(current.mark, current.plan.settle)
      }
      // `release(false)`, not `finish()`: the document stays on the frame the
      // write was made to. Landing on the settle here would apply the edit and
      // then move the flame out from under it.
      release(false)
    },
    cancel: () => {
      release(false)
    },
    finish: () => {
      release(true)
    },
    dispose: () => {
      release(false)
    },
  }
}

// ── The workspace's instance ────────────────────────────────────────────────
// One runtime per workspace, reached the way `getWebMcpContext` is: the agent
// surface, the replay player and the commands all need it, and none of them
// sits under the workspace in the component tree.

let current: GlideRuntime | undefined

export function setGlideRuntime(runtime: GlideRuntime | undefined): void {
  current = runtime
}

export function getGlideRuntime(): GlideRuntime | undefined {
  return current
}

/**
 * Hand the document back to whoever is writing it right now.
 *
 * Wired to the flame history's own hooks — a gesture opening, an entry
 * landing — so a slider drag or a button press during a transition takes the
 * flame off the glide instead of being overwritten frame by frame and then
 * replaced by the settle.
 *
 * Machinery is exempt, and the recorder already answers "was a person behind
 * this write": the replay player commits its batch inside
 * `withRecordingSuppressed`, and that commit can land while the last step's
 * transition is still moving. Cancelling there would freeze a replay on a
 * half-finished frame.
 */
export function yieldGlideToDocumentWrite(): void {
  if (isRecordingSuppressed()) return
  current?.noteForeignWrite()
}

/**
 * Land a transition before the document time-travels.
 *
 * Wired to the flame history's `onBeforeTimeTravel`, so undo and redo reach it
 * however they were triggered — the keyboard router, the toolbar command, the
 * agent's tool — rather than each call site remembering to ask.
 *
 * It settles rather than cancelling in place, which is the opposite of what a
 * person's edit does, and for the opposite reason: an edit is made to the
 * frame on screen, while an undo is computed from the entry's own end state.
 * Applying a backward patch to a half-interpolated frame is only as exact as
 * the patch model, so the document is put back on the state the entry recorded
 * before the patch is taken.
 *
 * Deliberately not exempt while recording is suppressed: a replayed undo wants
 * the same exactness, and settling an already-settled runtime does nothing.
 */
export function settleGlideBeforeTimeTravel(): void {
  current?.finish()
}

/** The tier a caller would get right now, without planning anything. */
export function currentGlideQuality(qualityPreset?: string): GlideQuality {
  return resolveGlideQuality(glideQualityPreference(), qualityPreset)
}
