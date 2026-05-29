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
  cmd.execute(ctx, ...args)
}
