import { getAllCommands } from '@/commands/registry'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { WebMcpTool } from '@/webmcp/types'

const MAX_COMMANDS = 30

export const listCommands: WebMcpTool = {
  name: 'list_commands',
  description:
    'List available commands that can be executed via execute_command. Optionally filter by prefix (e.g. "flame.", "timeline."). Returns command IDs, labels, and descriptions. Use to discover what actions are available.',
  inputSchema: {
    type: 'object',
    properties: {
      prefix: {
        type: 'string',
        description:
          "Filter commands by ID prefix, e.g. 'flame.' or 'timeline.'",
      },
    },
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: (input: unknown) => {
    const ctx = getWebMcpContext()
    if (!ctx) {
      return {
        error:
          'No active workspace context available. The application may still be loading or unmounted.',
      }
    }

    const rawInput = input as { prefix?: string } | undefined
    const prefix =
      typeof rawInput?.prefix === 'string' ? rawInput.prefix : undefined

    let commands = getAllCommands()
    if (prefix !== undefined && prefix.length > 0) {
      commands = commands.filter((cmd) => cmd.id.startsWith(prefix))
    }

    const total = commands.length
    const truncated = total > MAX_COMMANDS
    const displayed = commands.slice(0, MAX_COMMANDS)

    return {
      total,
      truncated,
      commands: displayed.map((cmd) => ({
        id: cmd.id,
        label: cmd.label,
        description: cmd.description,
      })),
    }
  },
}
