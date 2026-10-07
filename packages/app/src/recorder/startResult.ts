/**
 * What asking the recorder to start a take answers: ok, or the reason it
 * refused. A type-only leaf with no imports, so the command context
 * (commands/types.ts) can name it without depending on the recorder's other
 * public types, which themselves depend on FlameCommand.
 */

export type SessionRecordingStartFailureReason =
  | 'already-recording'
  | 'workspace-not-serializable'
  | 'workspace-not-recordable'

export type SessionRecordingStartResult =
  | { ok: true }
  | { ok: false; reason: SessionRecordingStartFailureReason }
