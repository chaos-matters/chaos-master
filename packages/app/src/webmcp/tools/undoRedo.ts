import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { WebMcpTool } from '@/webmcp/types'

export const undo: WebMcpTool = {
  name: 'undo',
  description:
    'Undo the last action. Returns the new undo/redo state after the operation. Use get_undo_state first to check what will be undone.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute() {
    const ctx = getWebMcpContext()
    if (!ctx) {
      return {
        error:
          'Workspace not ready. The flame editor has not finished loading.',
      }
    }

    ctx.history?.undo()

    const undoTarget = ctx.history?.peekUndoTarget?.()
    const redoTarget = ctx.history?.peekRedoTarget?.()

    return {
      success: true,
      canUndo: undoTarget !== undefined,
      canRedo: redoTarget !== undefined,
      undoTarget: undoTarget?.system ?? null,
      redoTarget: redoTarget?.system ?? null,
    }
  },
}

export const redo: WebMcpTool = {
  name: 'redo',
  description:
    'Redo the last undone action. Returns the new undo/redo state after the operation.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute() {
    const ctx = getWebMcpContext()
    if (!ctx) {
      return {
        error:
          'Workspace not ready. The flame editor has not finished loading.',
      }
    }

    ctx.history?.redo()

    const undoTarget = ctx.history?.peekUndoTarget?.()
    const redoTarget = ctx.history?.peekRedoTarget?.()

    return {
      success: true,
      canUndo: undoTarget !== undefined,
      canRedo: redoTarget !== undefined,
      undoTarget: undoTarget?.system ?? null,
      redoTarget: redoTarget?.system ?? null,
    }
  },
}
