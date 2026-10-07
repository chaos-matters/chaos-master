/**
 * The change history's types: the shape of an entry, the preview lease, the
 * public surface every consumer holds, and the hooks a host can pass in.
 *
 * Separate from the implementation because that is where the contract is
 * read. Twenty-eight modules import `ChangeHistory` and never open
 * `createStoreHistory.ts`, and the file it was carved out of had grown past
 * the size the health ratchet allows.
 */
import type { Patch } from 'structurajs'

export type HistoryItem = {
  description?: string
  forwardPatches: Patch[]
  backwardPatches: Patch[]
  /** Optional workspace state that travels with this entry. Replay uses this
   *  to keep timeline/audio/view restoration atomic with the flame patches. */
  undoEffect?: () => void
  redoEffect?: () => void
  /** Keep an entry whose flame patches are empty when its side effects still
   *  represent a real workspace change. */
  force?: boolean
  /** Journal stamp for cross-system chronological undo (journaled mode). */
  seq?: number
}

/**
 * Opaque lease for a long-lived preview transaction.
 *
 * Ordinary pointer gestures do not need one. Timed replay does: it leaves a
 * preview open while waiting between steps, so an unrelated user gesture must
 * be able to take the document back without accidentally appending its writes
 * to replay's undo entry (or letting later replay steps append to the user's
 * gesture).
 */
export type HistoryPreviewOwner = symbol

export type PreviewHistoryItem = HistoryItem & {
  owner?: HistoryPreviewOwner
  onTakeover?: () => void
}

export type HistoryCommitOptions = Pick<
  HistoryItem,
  'undoEffect' | 'redoEffect' | 'force'
>

export type HistorySetter<T extends object> = (
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  setFn: (draft: T) => T | void,
  description?: string,
) => void

export type ChangeHistory<T> = {
  readonly replace: (value: T, description?: string) => void
  readonly undo: () => void
  readonly redo: () => void
  readonly hasUndo: () => boolean
  readonly hasRedo: () => boolean
  readonly startPreview: (description?: string) => void
  /**
   * Open a preview that only writes made through `withPreviewOwner` may join.
   * The first ordinary write or gesture synchronously invokes `onTakeover`;
   * the owner should stop its producer and commit the preview there.
   */
  readonly startOwnedPreview: (
    description: string | undefined,
    onTakeover: () => void,
  ) => HistoryPreviewOwner
  /** Run one owned producer write. Throws after that owner has relinquished. */
  readonly withPreviewOwner: <R>(owner: HistoryPreviewOwner, fn: () => R) => R
  /** Relinquish an owned preview before a non-flame command mutates UI state. */
  readonly takeOverOwnedPreview: () => boolean
  /** True for any preview, including one exclusively owned by replay. */
  readonly hasOpenPreview: () => boolean
  /** True when the current/ordinary producer owns the open preview. */
  readonly isPreviewing: () => boolean
  readonly isUndoingOrRedoing: () => boolean
  readonly commit: (options?: HistoryCommitOptions) => void
  /** Commit only when `owner` still owns the active preview. */
  readonly commitOwnedPreview: (
    owner: HistoryPreviewOwner,
    options?: HistoryCommitOptions,
  ) => boolean
  /** Rewrite the newest entry to end on the store's current value instead of
   *  `recordedEnd`, for a change that was presented as a transition and cut
   *  short. `mark` is the `peekUndoSeq()` taken when that transition started;
   *  false when the entry is no longer that one, or never ended there. */
  readonly amendNewestEntry: (mark: number | null, recordedEnd: T) => boolean
  /** Journal stamp of the entry the next undo/redo would apply (null: none).
   *  Used by the cross-system undo router; always null when not journaled. */
  readonly peekUndoSeq: () => number | null
  readonly peekRedoSeq: () => number | null
  /** Mutate the store WITHOUT recording history. For automated writers that
   *  must never pollute undo: the animation export applying per-frame state
   *  (one entry per exported frame otherwise) and derived follower effects
   *  like 3D auto-exposure (whose reactive write after an undo would inject
   *  a fresh entry and destroy redo). */
  readonly setSilently: (setFn: (draft: T) => void) => void
  /** Replace the store WITHOUT recording history. Used by undo side effects
   *  that must restore writes which were intentionally silent at source. */
  readonly replaceSilently: (value: T) => void
}

export type CreateStoreHistoryOptions = {
  /** Join the app-wide undo journal: entries get recency stamps for the
   *  cross-system undo router, and any journaled push (here or in the
   *  timeline) invalidates redo everywhere. Leave OFF for throwaway preview
   *  histories (e.g. the variation browser) so they stay isolated. */
  journal?: boolean
  /** Called whenever a NEW entry lands on the stack (set, commit, replace) —
   *  exactly once per undoable edit, after no-op elision, and never for
   *  undo/redo/setSilently. `fromPreview` marks the entry a gesture produced,
   *  whose writes arrived during the preview rather than under the call that
   *  pushes it. The session recorder hooks the main flame history here to
   *  detect writes that did not arrive through a registered command (see
   *  recorder/recorder.ts). */
  onEntryPushed?: (
    description: string | undefined,
    fromPreview: boolean,
  ) => void
  /** Called when a gesture opens (`startPreview`). Bounds the window in which
   *  the recorder coalesces a drag's repeated commands into one action. */
  onPreviewStarted?: () => void
  /** Called immediately BEFORE an ordinary edit writes the store (`set`,
   *  `replace`), while it still holds the frame the viewer can see and the
   *  stack still ends on the entry that edit is being made against. Anything
   *  that has to hand the document back — a transition writing interpolated
   *  frames through `replaceSilently` — does it here, because afterwards the
   *  edit's own entry is on top and the transition's is not. */
  onBeforeDocumentWrite?: () => void
  /** Called immediately BEFORE an undo or a redo patches the store, and only
   *  when one is really about to happen. The entry being applied was recorded
   *  against the state its own patches end on, so anything presenting the
   *  document as something else — a transition writing interpolated frames
   *  through `replaceSilently` — has to land before the patch is computed, or
   *  time travel is applied to a state no entry describes. */
  onBeforeTimeTravel?: () => void
}
