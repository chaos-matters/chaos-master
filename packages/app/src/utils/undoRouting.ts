import type { ChangeHistory } from './createStoreHistory'
import type { TimelineState } from './timeline'

/**
 * One chronological undo across the app's two undo systems.
 *
 * The flame change-history and the timeline keep separate stacks; the user
 * has one intent: "revert my last action". Both systems stamp journaled
 * entries with a shared recency seq (utils/undoJournal.ts); this router
 * compares the tops and:
 *  - undo: applies the LARGER seq (the more recent action),
 *  - redo: applies the SMALLER seq (replay forward in original order).
 *
 * Previously Ctrl+Z drained the ENTIRE timeline stack before any flame edit
 * became reachable — with keyframe recording on, the first Ctrl+Z after a
 * drag looked like a no-op — while the toolbar buttons only ever drove flame
 * history. Every entry point routes through here now, so button and shortcut
 * always agree.
 */
export function createUndoRouter(
  history: Pick<
    ChangeHistory<unknown>,
    'undo' | 'redo' | 'hasUndo' | 'hasRedo' | 'peekUndoSeq' | 'peekRedoSeq'
  >,
  timeline: Pick<
    TimelineState,
    | 'timelineUndo'
    | 'timelineRedo'
    | 'hasTimelineUndo'
    | 'hasTimelineRedo'
    | 'peekUndoSeq'
    | 'peekRedoSeq'
  >,
) {
  const undoLast = (): boolean => {
    const t = timeline.peekUndoSeq()
    const f = history.peekUndoSeq()
    if (t === null && f === null && !history.hasUndo()) return false
    if (t !== null && (f === null || t > f)) {
      timeline.timelineUndo()
      return true
    }
    if (history.hasUndo()) {
      history.undo()
      return true
    }
    // Timeline has entries but no flame history (t non-null, f null already
    // handled above) — nothing left.
    return false
  }

  const redoLast = (): boolean => {
    const t = timeline.peekRedoSeq()
    const f = history.peekRedoSeq()
    if (t === null && f === null && !history.hasRedo()) return false
    if (t !== null && (f === null || t < f)) {
      timeline.timelineRedo()
      return true
    }
    if (history.hasRedo()) {
      history.redo()
      return true
    }
    return false
  }

  const canUndo = () => timeline.hasTimelineUndo() || history.hasUndo()
  const canRedo = () => timeline.hasTimelineRedo() || history.hasRedo()

  return { undoLast, redoLast, canUndo, canRedo }
}
