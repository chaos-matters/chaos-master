import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { tryValidateTimelineSnapshot } from '@/flame/schema/timeline'
import { isUndoTargetWithinRecording, replaceCurrentRecordedAction, reportUnreplayable, } from '@/recorder/recorder'
import { deepClone } from '@/utils/clone'
import { registerCommand } from '../registry'
import type { CommandContext } from '../types'

/** Internal, data-only command used for timeline undo/redo in a recording. */
registerCommand({
  id: 'recorder.restoreWorkspaceSnapshot',
  label: 'Restore Recorded Workspace State',
  description: 'Restore the flame and timeline captured after undo or redo',
  validateReplayArgs(args) {
    if (args.length !== 2) {
      return 'workspace restore expects a flame and timeline snapshot'
    }
    if (!tryValidateFlame(deepClone(args[0]))) {
      return 'workspace restore flame is invalid'
    }
    if (!tryValidateTimelineSnapshot(args[1])) {
      return 'workspace restore timeline is invalid'
    }
    return undefined
  },
  execute(ctx, flameData?: unknown, timelineData?: unknown) {
    const flame = tryValidateFlame(deepClone(flameData))
    const timeline = tryValidateTimelineSnapshot(timelineData)
    if (!flame || !timeline) {
      console.warn(
        '[cmd] recorder.restoreWorkspaceSnapshot: rejected',
        flameData,
        timelineData,
      )
      return
    }
    ctx.setFlameDescriptor(() => flame, 'Restore Recorded Workspace State')
    ctx.timeline.edit?.load(timeline)
  },
})

function replaceRecordedHistoryAction(
  ctx: CommandContext,
  system: 'flame' | 'timeline',
  label: 'Undo' | 'Redo',
) {
  if (system === 'timeline') {
    const timeline = ctx.timeline.edit?.snapshot()
    if (timeline) {
      replaceCurrentRecordedAction(
        'recorder.restoreWorkspaceSnapshot',
        [deepClone(ctx.flameDescriptor()), timeline],
        label,
      )
      return
    }
  }
  replaceCurrentRecordedAction(
    'flame.load',
    [deepClone(ctx.flameDescriptor()), label],
    label,
  )
}

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
  // Live undo is recorded as the resulting data snapshot. An imported
  // history command must never operate on the viewer's private stacks.
  replayable: false,
  execute(ctx) {
    const target = ctx.history?.peekUndoTarget?.()
    const replayable = isUndoTargetWithinRecording(target)
    if (!replayable) {
      reportUnreplayable('Undo reaching outside the recorded session')
    }
    ctx.history?.undo()
    if (replayable && target) {
      replaceRecordedHistoryAction(ctx, target.system, 'Undo')
    }
  },
})

registerCommand({
  id: 'history.redo',
  label: 'Redo',
  description: 'Redo the most recently undone edit',
  replayable: false,
  execute(ctx) {
    const target = ctx.history?.peekRedoTarget?.()
    const replayable = isUndoTargetWithinRecording(target)
    if (!replayable) {
      reportUnreplayable('Redo reaching outside the recorded session')
    }
    ctx.history?.redo()
    if (replayable && target) {
      replaceRecordedHistoryAction(ctx, target.system, 'Redo')
    }
  },
})
