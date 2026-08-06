import { registerCommand } from '../registry'

// Undo/redo move the history stacks without pushing new entries, so they are
// invisible to the session recorder's unnamed-write detector — routing them
// through the registry is the only way a recording captures them, and a log
// that misses an undo replays into the wrong flame. Call sites guard with
// canUndo/canRedo so a recording never logs a no-op.

registerCommand({
  id: 'history.undo',
  label: 'Undo',
  description:
    'Undo the most recent edit (flame or timeline, whichever is newer)',
  execute(ctx) {
    ctx.history?.undo()
  },
})

registerCommand({
  id: 'history.redo',
  label: 'Redo',
  description: 'Redo the most recently undone edit',
  execute(ctx) {
    ctx.history?.redo()
  },
})
