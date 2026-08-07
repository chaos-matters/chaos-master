import { isUndoTargetWithinRecording, reportUnreplayable, } from '@/recorder/recorder'
import { registerCommand } from '../registry'

// Undo/redo move the history stacks without pushing new entries, so they are
// invisible to the session recorder's unnamed-write detector — routing them
// through the registry is the only way a recording captures them, and a log
// that misses an undo replays into the wrong flame. Call sites guard with
// canUndo/canRedo so a recording never logs a no-op.
//
// An undo only replays faithfully when it reverts an edit the log itself
// contains. Undoing a TIMELINE edit (not part of the recorded document) or an
// edit made BEFORE recording started cannot be reproduced — on replay that
// undo would revert the replayer's own load of the initial flame instead. Such
// an undo is reported as unreplayable rather than recorded, which keeps the
// session's honesty marker truthful instead of silently diverging.

registerCommand({
  id: 'history.undo',
  label: 'Undo',
  description:
    'Undo the most recent edit (flame or timeline, whichever is newer)',
  execute(ctx) {
    if (!isUndoTargetWithinRecording(ctx.history?.peekUndoTarget?.())) {
      reportUnreplayable('Undo reaching outside the recorded session')
    }
    ctx.history?.undo()
  },
})

registerCommand({
  id: 'history.redo',
  label: 'Redo',
  description: 'Redo the most recently undone edit',
  execute(ctx) {
    if (!isUndoTargetWithinRecording(ctx.history?.peekRedoTarget?.())) {
      reportUnreplayable('Redo reaching outside the recorded session')
    }
    ctx.history?.redo()
  },
})
