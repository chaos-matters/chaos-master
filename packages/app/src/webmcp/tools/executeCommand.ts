import { executeCommand, preflightReplayCommand } from '@/commands/registry'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { WebMcpTool } from '@/webmcp/types'

export const executeCommandTool: WebMcpTool = {
  name: 'execute_command',
  description:
    'Execute any registered command by ID. Use list_commands to discover available commands. Arguments are passed as an array. Commands are validated before execution for safety. This is an escape hatch for advanced use.',
  inputSchema: {
    type: 'object',
    properties: {
      commandId: {
        type: 'string',
        description: "The command ID to execute, e.g. 'flame.setExposure'",
      },
      args: {
        type: 'array',
        items: {},
        description: 'Arguments array for the command',
      },
    },
    required: ['commandId'],
  },
  execute(input: unknown) {
    const ctx = getWebMcpContext()
    if (!ctx) {
      return {
        error:
          'Workspace not ready. The flame editor has not finished loading.',
      }
    }

    const rawInput =
      typeof input === 'object' && input !== null
        ? (input as Record<string, unknown>)
        : undefined

    if (
      !rawInput ||
      typeof rawInput.commandId !== 'string' ||
      rawInput.commandId.trim().length === 0
    ) {
      return {
        error: 'Invalid input: "commandId" string property is required.',
      }
    }

    const commandId = rawInput.commandId
    const args = Array.isArray(rawInput.args) ? rawInput.args : []

    const preflightError = preflightReplayCommand(commandId, args)
    if (preflightError !== undefined) {
      return { error: preflightError }
    }

    try {
      // Live dispatch: recorded by the session recorder, args normalised, and
      // `beforeCommand` hands any paused replay back first. The replay path
      // (`executeReplayCommand`) skips all three, which is right for a
      // .steps.json file and wrong for an agent driving the editor.
      executeCommand(commandId, ctx, ...args)
    } catch (e) {
      return {
        error: `Command failed: ${e instanceof Error ? e.message : String(e)}`,
      }
    }

    return { success: true, commandId }
  },
}
