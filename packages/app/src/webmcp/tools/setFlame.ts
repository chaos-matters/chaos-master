import { executeCommand } from '@/commands/registry'
import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { WebMcpTool } from '@/webmcp/types'

export const setFlame: WebMcpTool = {
  name: 'set_flame',
  description:
    'Load a complete flame descriptor, replacing the current flame. The descriptor is validated through the schema before loading. Use get_flame first to understand the expected structure, then modify and set it back.',
  inputSchema: {
    type: 'object',
    properties: {
      flame: {
        type: 'object',
        description: 'Complete FlameDescriptor object to load',
      },
      label: {
        type: 'string',
        description: 'Optional undo history label for this load',
      },
    },
    required: ['flame'],
  },
  execute(input: unknown) {
    const ctx = getWebMcpContext()
    if (!ctx) {
      return {
        error:
          'Workspace not ready. The flame editor has not finished loading.',
      }
    }

    if (
      typeof input !== 'object' ||
      input === null ||
      !('flame' in input) ||
      typeof input.flame !== 'object' ||
      input.flame === null
    ) {
      return { error: 'Invalid input: "flame" object property is required.' }
    }

    const { flame, label } = input as { flame: unknown; label?: unknown }
    const validatedFlame = tryValidateFlame(deepClone(flame))
    if (!validatedFlame) {
      return {
        error:
          'Invalid flame descriptor: failed schema validation. Please inspect the structure with get_flame.',
      }
    }

    const historyLabel =
      typeof label === 'string' && label.trim().length > 0
        ? label
        : 'WebMCP: Set Flame'

    try {
      executeCommand('flame.load', ctx, validatedFlame, historyLabel)
      return { success: true }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}
