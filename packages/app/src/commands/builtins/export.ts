/**
 * Export commands.
 *
 * Two of them open the export modal, which is how a person exports. The other
 * three are the same background export with no dialog in the way, for a script
 * or an agent driving the app through `execute_command`: queue a render, ask
 * whether it finished, then collect the file from the tracker's Download link.
 * Nothing about the modal path changes — `export.png` and `export.animation`
 * are the commands they always were.
 *
 * The scripted pair is deliberately thin: it validates the caller's options
 * against the modal's own limits (see utils/exportRequests.ts) and hands them
 * to `ctx.exportJobs`, which the workspace implements because only it holds
 * the palette, blend flame, timeline and recorded session a job snapshots.
 */

import { exportQueueState } from '@/utils/exportJobs'
import { normalizeAnimationRenderRequest, normalizeImageRenderRequest, } from '@/utils/exportRequests'
import { registerCommand } from '../registry'

registerCommand({
  id: 'export.png',
  label: 'Export PNG',
  description: 'Open the PNG export options',
  preservesFinishedSession: true,
  shortcut: 'Ctrl+E',
  execute(ctx) {
    ctx.modal.open('exportPng')
  },
})

registerCommand({
  id: 'export.animation',
  label: 'Export Animation',
  description: 'Open the animation export modal',
  preservesFinishedSession: true,
  shortcut: 'Ctrl+Shift+A',
  execute(ctx) {
    ctx.modal.open('exportAnimation')
  },
})

/**
 * Queueing a render is not an edit of the document, so none of the three is
 * recorded: a creation session describes how a flame was made, and "and then
 * I exported it at 2560x1440" is not part of that. Nor is one a step the take
 * failed to capture: with `preservesFinishedSession` they change nothing a
 * replay reproduces, so a take counts none of them as uncaptured (recorder.ts
 * `recordCommandExecutionIn`). They stay replay-validated
 * all the same, because that is the gate `execute_command` applies — and the
 * options are bounded (4096 px, 3600 frames) so a hand-written session file
 * can queue no more work than a person with the dialog open could.
 */
registerCommand({
  id: 'export.renderImage',
  label: 'Render Image Export',
  description:
    'Queue a background PNG render at an exact size, without opening the export modal. Progress and the download appear in the export tracker; poll export.jobStatus.',
  describe: ([options]) => {
    const size =
      options !== null && typeof options === 'object'
        ? (options as { width?: unknown; height?: unknown })
        : undefined
    return typeof size?.width === 'number' && typeof size.height === 'number'
      ? `Render image ${size.width}x${size.height}`
      : 'Render image export'
  },
  recordable: false,
  preservesFinishedSession: true,
  validateReplayArgs(args) {
    if (args.length !== 1) return 'render image expects one options object'
    const parsed = normalizeImageRenderRequest(args[0])
    return 'error' in parsed ? parsed.error : undefined
  },
  execute(ctx, options?: unknown) {
    const parsed = normalizeImageRenderRequest(options)
    if ('error' in parsed) return
    ctx.exportJobs?.renderImage(parsed.request)
  },
  report: (ctx) =>
    ctx.exportJobs === undefined
      ? { error: 'This workspace has no export host.' }
      : exportQueueState(),
})

registerCommand({
  id: 'export.renderAnimation',
  label: 'Render Animation Export',
  description:
    'Queue a background video render of the timeline at an exact size and frame rate, without opening the export modal. Omitted frames render the modal default range. Poll export.jobStatus, then download from the export tracker.',
  describe: ([options]) => {
    const spec =
      options !== null && typeof options === 'object'
        ? (options as { width?: unknown; height?: unknown; fps?: unknown })
        : undefined
    return typeof spec?.width === 'number' &&
      typeof spec.height === 'number' &&
      typeof spec.fps === 'number'
      ? `Render animation ${spec.width}x${spec.height} @${spec.fps}`
      : 'Render animation export'
  },
  recordable: false,
  preservesFinishedSession: true,
  validateReplayArgs(args) {
    if (args.length !== 1) return 'render animation expects one options object'
    const parsed = normalizeAnimationRenderRequest(args[0])
    return 'error' in parsed ? parsed.error : undefined
  },
  execute(ctx, options?: unknown) {
    const parsed = normalizeAnimationRenderRequest(options)
    if ('error' in parsed) return
    ctx.exportJobs?.renderAnimation(parsed.request)
  },
  report: (ctx) =>
    ctx.exportJobs === undefined
      ? { error: 'This workspace has no export host.' }
      : exportQueueState(),
})

registerCommand({
  id: 'export.jobStatus',
  label: 'Export Job Status',
  description:
    'Report the background export queue: how many jobs are pending, the one rendering now with its progress, the last one that finished with its size and frame count, and the last error.',
  describe: () => 'Read the export queue',
  // A read, not a write: it changes nothing, so there is nothing to record and
  // nothing for a replay to reproduce. The whole command is its `report`.
  recordable: false,
  preservesFinishedSession: true,
  validateReplayArgs: (args) =>
    args.length === 0 ? undefined : 'export status takes no arguments',
  execute() {},
  report: () => exportQueueState(),
})
