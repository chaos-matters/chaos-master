import '@/commands/builtins'
import { beforeEach, describe, expect, it } from 'vitest'
import { setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { listCommands } from './listCommands'

type Entry = { id: string; args?: string }
type Result = { commands: Entry[] }

/**
 * A lesson brief is sent once. A client that truncates it takes the argument
 * shapes with it, and a second `arcade_start_lesson` is refused as already
 * active — a real agent lost the line for `flame.setVariationParams` mid-lesson
 * and recovered it by reading the app bundle instead.
 */
describe('list_commands argument hints', () => {
  beforeEach(() => {
    setWebMcpContext(createMockCommandContext())
  })

  it('re-serves the shape a truncated brief lost', async () => {
    const result = (await listCommands.execute(
      { prefix: 'flame.setVariationParams' },
      {},
    )) as Result
    const entry = result.commands.find(
      (command) => command.id === 'flame.setVariationParams',
    )
    expect(entry?.args).toContain('transformId')
    expect(entry?.args).toContain('paramName')
  })

  it('leaves an unfiltered page alone', async () => {
    // Hints run to a line each and exist for a third of the registry, so
    // attaching them to a full page would push it into the same client
    // truncation this exists to recover from.
    const result = (await listCommands.execute({}, {})) as Result
    expect(result.commands.every((command) => command.args === undefined)).toBe(
      true,
    )
  })
})
