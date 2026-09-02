import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { WebMcpTool } from '@/webmcp/types'

export const getUndoState: WebMcpTool = {
  name: 'get_undo_state',
  description:
    'Check what undo and redo would do. Returns the target type (flame or timeline) for both undo and redo, or null if the stack is empty. Use before undo/redo to confirm the action.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: () => {
    const ctx = getWebMcpContext()
    if (!ctx) {
      return {
        error:
          'No active workspace context available. The application may still be loading or unmounted.',
      }
    }

    const undoTarget = ctx.history?.peekUndoTarget?.()
    const redoTarget = ctx.history?.peekRedoTarget?.()

    return {
      canUndo: undoTarget !== undefined,
      canRedo: redoTarget !== undefined,
      undoTarget: undoTarget?.system ?? null,
      redoTarget: redoTarget?.system ?? null,
    }
  },
}
