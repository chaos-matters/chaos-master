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
/**
 * Which system the next undo/redo would act on, and the journal stamp of the
 * entry it would apply (`null` when that history isn't journaled).
 *
 * Exposed because callers need to reason about the target BEFORE acting: the
 * session recorder only considers an undo replayable when it lands on a flame
 * entry created during the recording (see recorder/recorder.ts).
 */
export type UndoTarget = {
  system: 'flame' | 'timeline'
  seq: number | null
}

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
  // The arbitration lives ONLY in these two peeks; undoLast/redoLast just act
  // on what they report, so "what would undo do?" can never disagree with
  // "what did undo do?".
  const peekUndoTarget = (): UndoTarget | undefined => {
    const t = timeline.peekUndoSeq()
    const f = history.peekUndoSeq()
    if (t !== null && (f === null || t > f))
      return { system: 'timeline', seq: t }
    if (history.hasUndo()) return { system: 'flame', seq: f }
    return undefined
  }

  const peekRedoTarget = (): UndoTarget | undefined => {
    const t = timeline.peekRedoSeq()
    const f = history.peekRedoSeq()
    if (t !== null && (f === null || t < f))
      return { system: 'timeline', seq: t }
    if (history.hasRedo()) return { system: 'flame', seq: f }
    return undefined
  }

  const undoLast = (): boolean => {
    const target = peekUndoTarget()
    if (!target) return false
    if (target.system === 'timeline') {
      timeline.timelineUndo()
    } else {
      history.undo()
    }
    return true
  }

  const redoLast = (): boolean => {
    const target = peekRedoTarget()
    if (!target) return false
    if (target.system === 'timeline') {
      timeline.timelineRedo()
    } else {
      history.redo()
    }
    return true
  }

  const canUndo = () => timeline.hasTimelineUndo() || history.hasUndo()
  const canRedo = () => timeline.hasTimelineRedo() || history.hasRedo()

  return {
    undoLast,
    redoLast,
    canUndo,
    canRedo,
    peekUndoTarget,
    peekRedoTarget,
  }
}
