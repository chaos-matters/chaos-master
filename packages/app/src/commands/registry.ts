import { recordCommandExecution } from '@/recorder/recorder'
import { IS_DEV } from '../defaults'
import type { CommandContext, FlameCommand } from './types'

const commandRegistry = new Map<string, FlameCommand>()

export function registerCommand(cmd: FlameCommand): void {
  commandRegistry.set(cmd.id, cmd)
}

export function getCommand(id: string): FlameCommand | undefined {
  return commandRegistry.get(id)
}

export function getAllCommands(): FlameCommand[] {
  return [...commandRegistry.values()]
}

export function executeCommand(
  id: string,
  ctx: CommandContext,
  ...args: unknown[]
): void {
  const cmd = commandRegistry.get(id)
  if (!cmd) {
    if (IS_DEV) console.warn(`Command "${id}" not found in registry`)
    return
  }
  if (IS_DEV) console.info('[cmd:execute]', id, 'args:', ...args)
  // Canonicalize BEFORE recording: normalizeArgs pins minted ids/seeds and
  // converts positional refs to stable ids, so the log and the execution see
  // the same, replayable arguments.
  const finalArgs = cmd.normalizeArgs ? cmd.normalizeArgs(ctx, args) : args
  // Every execution passes through the session recorder: logged when a
  // recording is active, and scoped either way so history writes are
  // attributed to their command (see recorder/recorder.ts).
  recordCommandExecution(cmd, finalArgs, () => {
    cmd.execute(ctx, ...finalArgs)
  })
}
