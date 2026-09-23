/**
 * The session recorder's public types, apart from the module that implements
 * them: what a recording starts from, what a command must expose to be
 * recorded, and the per-seat recorder handle. Type-only, so any module may
 * depend on it without reaching the recorder's runtime state.
 */

import type { RecordedSession, SessionViewSnapshot, UncapturedStep, } from './schema'
import type { SonificationSnapshot } from './sonificationState'
import type { FlameCommand } from '@/commands/types'
import type { AudioWiringSnapshot } from '@/flame/schema/audioWiring'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineSnapshot } from '@/flame/schema/timeline'
import type { SeatId } from '@/seats/seatId'
import type { UndoTarget } from '@/utils/undoRouting'

export type SessionRecordingStartFailureReason =
  | 'already-recording'
  | 'workspace-not-serializable'
  | 'workspace-not-recordable'

export type SessionRecordingStartResult =
  | { ok: true }
  | { ok: false; reason: SessionRecordingStartFailureReason }

/**
 * The editing state around the flame that a recording also starts from.
 *
 * The flame is the document, but it is not the whole world: keyframe edits
 * mean nothing without the tracks they land on, and an audio mapping drives
 * the flame every frame. Both are snapshotted so a replay edits the animation
 * it was recorded against rather than whatever the viewer happens to have
 * open. Optional because sandboxes (tests, the Home portal) have neither.
 */
export type SessionStartExtras = {
  timeline?: TimelineSnapshot
  audio?: AudioWiringSnapshot
  sonification?: SonificationSnapshot
  view?: SessionViewSnapshot
}

export type RecordableCommand = Pick<
  FlameCommand,
  | 'id'
  | 'label'
  | 'coalesceArgs'
  | 'coalesceKey'
  | 'describe'
  | 'focus'
  | 'preservesFinishedSession'
  | 'recordable'
>

/** One seat's recorder. Every method is the per-stream form of the module
 *  function of the same name; the module functions delegate to the `player`
 *  stream so existing callers see no change. */
export interface RecorderStream {
  readonly id: SeatId
  /** `now` lets several streams share one time origin (a duel starts both in
   *  one call). */
  start(
    initial: FlameDescriptor,
    extras?: SessionStartExtras,
    now?: number,
  ): SessionRecordingStartResult
  stop(): RecordedSession | undefined
  cancel(): void
  isRecording: () => boolean
  actionCount: () => number
  unnamedWriteCount: () => number
  /** The take's uncaptured steps so far, named (see uncapturedSteps.ts). */
  uncapturedSteps: () => readonly UncapturedStep[]
  lastSession: () => RecordedSession | undefined
  lastFinishedSession(): RecordedSession | undefined
  invalidateLastFinishedSession(): void
  liveWorkspaceMutationGeneration(): number
  recordCommandExecution(
    cmd: RecordableCommand,
    args: readonly unknown[],
    run: () => void,
  ): void
  recordSyntheticAction(
    id: string,
    args: readonly unknown[],
    label?: string,
  ): void
  replaceCurrentRecordedAction(
    id: string,
    args: readonly unknown[],
    label?: string,
  ): void
  reportUnreplayable(reason: string): void
  reportUnreplayableOnce(key: string, reason: string): void
  reportDocumentWrite(description?: string, fromPreview?: boolean): void
  reportTimelineWrite(description?: string): void
  reportTimelineTransport(description: string): void
  reportTimelinePlayback(
    playing: boolean,
    frame: number,
    advanced?: number,
  ): void
  reportDerivedWorkspaceWrite(): void
  isUndoTargetWithinRecording(target: UndoTarget | undefined): boolean
  notePreviewStarted(): void
  breakRecordingCoalescing(): void
}
