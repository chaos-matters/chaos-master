import { afterEach, describe, expect, it } from 'vitest'
import { duelActive, duelReady, duelRivalSeat, stopDuel } from '@/arcade/duel'
import { resetPilot } from '@/arcade/pilot'
import { clearWebMcpContext, getWebMcpTarget, setWebMcpContext, } from '@/webmcp/contextBridge'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { arcadeDuelReady, arcadeEndDuel, arcadeStartDuel } from './arcadeDuel'

const run = async (tool: typeof arcadeStartDuel, input: unknown) =>
  (await tool.execute(input, {})) as Record<string, unknown>

describe('arcade duel tools', () => {
  afterEach(() => {
    if (duelActive()) stopDuel()
    resetPilot()
    clearWebMcpContext('player')
    clearWebMcpContext('rival')
  })

  it('refuses without a workspace', async () => {
    expect(await run(arcadeStartDuel, {})).toHaveProperty('error')
  })

  it('duels a 3D flame, with both seats at that dimension', async () => {
    const ctx = createMockCommandContext()
    const flame = createTestFlame()
    flame.renderSettings.dimensions = 3
    ctx.flameDescriptor = () => flame
    setWebMcpContext(ctx)

    const result = await run(arcadeStartDuel, { durationSeconds: 60 })

    // The rival is a mirror of the player, so the two halves are the same
    // dimension by construction and the seats bind a 3D camera each.
    expect(result.ok).toBe(true)
    expect(duelRivalSeat()?.flame().renderSettings.dimensions).toBe(3)
  })

  it('starts and points the tools at the rival', async () => {
    setWebMcpContext(createMockCommandContext())
    const started = await run(arcadeStartDuel, { durationSeconds: 60 })
    expect(started.ok).toBe(true)
    expect(duelActive()).toBe(true)
    // Every tool reads the bridge with no argument, so this is what makes
    // execute_command land on the agent's flame.
    expect(getWebMcpTarget()).toBe('rival')
  })

  it('refuses to end the duel, and says so without hedging', async () => {
    setWebMcpContext(createMockCommandContext())
    await run(arcadeStartDuel, { durationSeconds: 60 })

    const refused = await run(arcadeEndDuel, { title: 'Probe' })

    expect(refused.ok).toBeUndefined()
    expect(String(refused.error)).toContain('You cannot end a duel')
    // "not yet" would read as an invitation to retry in a second.
    expect(String(refused.error)).not.toMatch(/not yet/i)
    expect(String(refused.error)).toContain('arcade_duel_ready')
    expect(duelActive()).toBe(true)
  })

  it('takes a ready declaration without ending anything', async () => {
    setWebMcpContext(createMockCommandContext())
    await run(arcadeStartDuel, { durationSeconds: 60 })

    const ready = await run(arcadeDuelReady, { title: 'Ember lattice' })

    expect(ready.ok).toBe(true)
    expect(duelReady()?.title).toBe('Ember lattice')
    expect(duelActive()).toBe(true)
    expect(getWebMcpTarget()).toBe('rival')
  })

  it('will not take a ready declaration outside a duel', async () => {
    setWebMcpContext(createMockCommandContext())
    expect(await run(arcadeDuelReady, { title: 'nothing' })).toHaveProperty(
      'error',
    )
  })

  it('refuses to start twice', async () => {
    setWebMcpContext(createMockCommandContext())
    await run(arcadeStartDuel, {})
    expect(await run(arcadeStartDuel, {})).toHaveProperty('error')
  })
})
