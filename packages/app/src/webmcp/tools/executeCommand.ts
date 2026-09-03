import { guardCommand } from '@/arcade/guard'
import { appendPilotLog, drivingState, notePilotStep, pilotStepsRemaining, } from '@/arcade/pilot'
import { executeCommand, getCommand, preflightLiveCommand, } from '@/commands/registry'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { WebMcpTool } from '@/webmcp/types'

/**
 * One readable line for the pilot overlay's live step list.
 *
 * The same sentence the recorder writes into the log, so the live rail and the
 * replay's step list say the same thing about the same step. Commands that
 * render their value into their own label ("Sonification model: ambient") are
 * why: appending raw JSON instead produced "Set Sonification Sound
 * [{"version":1,"model":"ambient",...]" live and the readable form only on
 * replay, which made the two views look like different sessions.
 *
 * The argument dump survives only as the fallback for commands that describe
 * nothing, where the values are the only thing distinguishing two steps.
 */
function describeStep(commandId: string, args: unknown[]): string {
  const cmd = getCommand(commandId)
  const described = cmd?.describe?.([...args])
  if (described !== undefined && described !== '') return described
  const label = cmd?.label ?? commandId
  let rendered = ''
  try {
    rendered = JSON.stringify(args)
  } catch {
    rendered = ''
  }
  if (rendered === '' || rendered === '[]') return label
  return rendered.length > 80
    ? `${label} ${rendered.slice(0, 77)}...`
    : `${label} ${rendered}`
}

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

    // While an Arcade pilot drives, the mode's allow-list and the step budget
    // apply before anything else: an agent must not be able to reach export,
    // history or a quality bump through the generic escape hatch.
    const driving = drivingState()
    if (driving) {
      const blocked = guardCommand(commandId, args, driving)
      if (blocked !== undefined) {
        appendPilotLog('error', blocked)
        return { error: blocked }
      }
      if (pilotStepsRemaining() <= 0) {
        return {
          error:
            'Step budget exhausted. Finish now with arcade_end_lesson or arcade_end_cinema.',
        }
      }
    }

    // Checked against the args that will be RECORDED, not the ones the agent
    // typed: `preflightLiveCommand` normalizes first, so a command that mints
    // its own seed or expands a boolean into a snapshot is reachable.
    const preflight = preflightLiveCommand(commandId, ctx, args)
    if ('error' in preflight) {
      return { error: preflight.error }
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

    if (driving) {
      // The NORMALIZED args, which are the ones the recorder describes and
      // logs. A command whose label renders its value reads them back out of
      // its canonical shape — `sonification.setConfig` cannot say
      // "Sonification model: ambient" from the flat config an agent typed,
      // only from the snapshot normalization builds.
      const remaining = notePilotStep(
        'command',
        describeStep(commandId, preflight.args),
      )
      return { success: true, commandId, steps: driving.steps + 1, remaining }
    }

    return { success: true, commandId }
  },
}
