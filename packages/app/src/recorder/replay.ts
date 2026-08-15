import { batch } from 'solid-js'
import { deepClone } from '@/utils/clone'
import { isSessionRecording, withRecordingSuppressed } from './recorder'
import type { RecordedSession, SessionViewSnapshot } from './schema'
import type { AudioWiringSnapshot } from '@/flame/schema/audioWiring'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineSnapshot } from '@/flame/schema/timeline'

export type ReplayAudioResources = {
  hasFileBuffer: boolean
  currentTrackName?: string
  hasLiveAnalyzer: boolean
}

/**
 * A session stores audio wiring, not audio bytes or microphone permission.
 * Never relabel and reuse an unrelated file merely because some buffer is
 * loaded; only enable the wiring when the required resource is truly present.
 */
export function canEnableReplayAudio(
  audio: AudioWiringSnapshot,
  resources: ReplayAudioResources,
): boolean {
  if (!audio.enabled) return false
  if (audio.source === 'mic') return resources.hasLiveAnalyzer
  return (
    resources.hasFileBuffer &&
    typeof audio.trackName === 'string' &&
    audio.trackName.length > 0 &&
    audio.trackName === resources.currentTrackName
  )
}

export type ReplayAudioTarget = {
  setMapping: (mapping: AudioWiringSnapshot['mapping']) => void
  setSource: (source: AudioWiringSnapshot['source']) => void
  setEnabled: (enabled: boolean) => void
}

/** Apply only serializable wiring. Resource identity is intentionally absent
 * from the target: replay cannot rename or replace the file/microphone that
 * the viewer actually loaded. */
export function applyReplayAudioWiring(
  audio: AudioWiringSnapshot,
  resources: ReplayAudioResources,
  target: ReplayAudioTarget,
): void {
  const mayEnable = canEnableReplayAudio(audio, resources)
  batch(() => {
    // Never leave the previously selected resource live while its wiring is
    // replaced. Solid targets publish only the final batched state; generic
    // targets still see the safety-first disable before any replacement.
    target.setEnabled(false)
    target.setMapping(deepClone(audio.mapping))
    target.setSource(audio.source)
    if (mayEnable) target.setEnabled(true)
  })
}

/**
 * Where a session is replayed INTO. Deliberately not a `CommandContext`:
 * the caller decides what "load the initial document" and "run a command"
 * mean for its world —
 *
 *  - the live workspace loads via `history.replace` and executes against its
 *    own `cmdContext`,
 *  - a sandbox (tests, gallery previews — the portalScript.ts recipe) loads
 *    into its private store and executes against its private context.
 *
 * The timed step-by-step player (milestone M4) builds on this same target.
 */
export type ReplayTarget = {
  /**
   * Clear transient presentation state before the replay transaction starts.
   *
   * This intentionally runs before `beginBatch`: hover previews may have
   * temporarily replaced the visible document, and restoring them after the
   * session baseline loads would overwrite that baseline. A sandbox with no
   * transient UI can leave this unset.
   */
  prepare?: () => void
  loadInitial: (flame: FlameDescriptor) => void
  /**
   * Restore the two documents that are not the flame: the timeline's tracks
   * and config, and the audio wiring. Both are optional on the session (older
   * recordings predate them) and optional here (a sandbox may have neither) —
   * and when a session carries none, the target is NOT called, so replaying an
   * old recording leaves the viewer's timeline alone rather than clearing it.
   */
  loadTimeline?: (timeline: TimelineSnapshot) => void
  loadAudio?: (audio: AudioWiringSnapshot) => void
  loadView?: (view: SessionViewSnapshot) => void
  /** False rejects an untrusted action and aborts the replay. */
  execute: (id: string, args: unknown[]) => unknown
  /** Validate canonical action args without touching workspace state. */
  preflight?: (id: string, args: readonly unknown[]) => string | undefined
  /**
   * Bracket a run of applied actions so the whole thing lands as ONE undoable
   * step. The workspace maps these to the history's `startPreview`/`commit`;
   * a sandbox with no history can leave them unset. Without it, replaying a
   * long session buries the user's own undo stack under one entry per step.
   */
  /**
   * `onTakeover` is called when a user edit tries to write while a timed
   * replay is waiting between steps. The player uses it to stop its clock and
   * commit the replay prefix before the user gesture begins.
   */
  beginBatch?: (onTakeover: () => void) => void
  /**
   * Attribute synchronous flame-history writes to the open replay batch.
   * Workspaces with an ownership-aware history use this to distinguish replay
   * commands from an intervening user edit; simple sandboxes can omit it.
   */
  withBatchWrite?: <R>(fn: () => R) => R
  endBatch?: () => void
}

/**
 * Apply a whole session instantly: initial document, then every action in
 * order, with no waiting. Suppressed from the recorder — replaying while
 * recording must not absorb the replayed actions into the new log.
 *
 * Replay fidelity is bounded by the session's `unnamedWriteCount`: a log
 * recorded with unnamed writes cannot reproduce them (they were never
 * captured), which is exactly what that count is for.
 */
export function replaySessionInstant(
  session: RecordedSession,
  target: ReplayTarget,
): boolean {
  if (isSessionRecording()) return false
  for (const action of session.actions) {
    if (target.preflight?.(action.id, action.args) !== undefined) return false
  }
  let batchOpen = false
  try {
    return withRecordingSuppressed(() => {
      target.prepare?.()
      target.beginBatch?.(() => {})
      batchOpen = true
      const apply = () => {
        loadSessionStart(session, target)
        for (const action of session.actions) {
          if (target.execute(action.id, deepClone(action.args)) === false) {
            return false
          }
        }
        return true
      }
      return target.withBatchWrite?.(apply) ?? apply()
    })
  } finally {
    if (batchOpen) target.endBatch?.()
  }
}

/** Put the target into the state the session was recorded from: flame, then
 *  the timeline and audio wiring the session carries (if any). Shared with the
 *  step-by-step player, whose every rebuild starts the same way. */
export function loadSessionStart(
  session: RecordedSession,
  target: ReplayTarget,
): void {
  target.loadInitial(deepClone(session.initial))
  if (session.initialTimeline && target.loadTimeline) {
    target.loadTimeline(deepClone(session.initialTimeline))
  }
  if (session.initialAudio && target.loadAudio) {
    target.loadAudio(deepClone(session.initialAudio))
  }
  if (session.initialView && target.loadView) {
    target.loadView(deepClone(session.initialView))
  }
}
