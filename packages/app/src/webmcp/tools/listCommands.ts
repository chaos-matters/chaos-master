import { getAllCommands } from '@/commands/registry'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { WebMcpTool } from '@/webmcp/types'

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 200

export const listCommands: WebMcpTool = {
  name: 'list_commands',
  description:
    'List available commands that can be executed via execute_command. Supports pagination via limit and offset, and filtering by prefix (e.g. "flame.", "timeline."). Returns command IDs, labels, descriptions, and a prefixes category index. Use to discover what actions are available.',
  inputSchema: {
    type: 'object',
    properties: {
      prefix: {
        type: 'string',
        description:
          "Filter commands by ID prefix, e.g. 'flame.' or 'timeline.'",
      },
      limit: {
        type: 'integer',
        description:
          'Maximum number of commands to return (default: 30, max: 200).',
      },
      offset: {
        type: 'integer',
        description: 'Number of commands to skip for pagination (default: 0).',
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

    const rawInput = input as
      | { prefix?: string; limit?: number; offset?: number }
      | undefined
    const prefix =
      typeof rawInput?.prefix === 'string' ? rawInput.prefix : undefined

    const all = getAllCommands()

    // Calculate prefixes summary across all registered commands
    const prefixCounts = new Map<string, number>()
    for (const cmd of all) {
      const dotIdx = cmd.id.indexOf('.')
      const p = dotIdx !== -1 ? cmd.id.slice(0, dotIdx + 1) : 'other'
      prefixCounts.set(p, (prefixCounts.get(p) ?? 0) + 1)
    }
    const prefixes = [...prefixCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([pfx, count]) => ({ prefix: pfx, count }))

    let commands = all
    if (prefix !== undefined && prefix.length > 0) {
      commands = commands.filter((cmd) => cmd.id.startsWith(prefix))
    }

    const total = commands.length
    const offset =
      typeof rawInput?.offset === 'number' && rawInput.offset >= 0
        ? Math.floor(rawInput.offset)
        : 0
    const limit =
      typeof rawInput?.limit === 'number' && rawInput.limit > 0
        ? Math.min(Math.floor(rawInput.limit), MAX_LIMIT)
        : DEFAULT_LIMIT

    const page = commands.slice(offset, offset + limit)
    const truncated = offset + page.length < total

    return {
      total,
      truncated,
      offset,
      prefixes,
      commands: page.map((cmd) => ({
        id: cmd.id,
        label: cmd.label,
        description: cmd.description,
      })),
    }
  },
}
