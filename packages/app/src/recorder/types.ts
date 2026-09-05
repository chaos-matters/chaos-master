export type SessionRecordingStartFailureReason =
  | 'already-recording'
  | 'workspace-not-serializable'
  | 'workspace-not-recordable'

export type SessionRecordingStartResult =
  | { ok: true }
  | { ok: false; reason: SessionRecordingStartFailureReason }
