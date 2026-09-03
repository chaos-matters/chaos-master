import { afterEach, describe, expect, it } from 'vitest'
import { duelActive, stopDuel } from '@/arcade/duel'
import { resetPilot } from '@/arcade/pilot'
import { clearWebMcpContext, getWebMcpTarget, setWebMcpContext, } from '@/webmcp/contextBridge'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { arcadeEndDuel, arcadeStartDuel } from './arcadeDuel'

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

  it('refuses a 3D flame, naming the reason', async () => {
    const ctx = createMockCommandContext()
    const flame = createTestFlame()
    flame.renderSettings.dimensions = 3
    ctx.flameDescriptor = () => flame
    setWebMcpContext(ctx)
    const result = await run(arcadeStartDuel, {})
    expect(String(result.error)).toMatch(/3D/)
  })

  it('starts, points the tools at the rival, and ends', async () => {
    setWebMcpContext(createMockCommandContext())
    const started = await run(arcadeStartDuel, { durationSeconds: 60 })
    expect(started.ok).toBe(true)
    expect(duelActive()).toBe(true)
    // Every tool reads the bridge with no argument, so this is what makes
    // execute_command land on the AI's flame.
    expect(getWebMcpTarget()).toBe('rival')

    const ended = await run(arcadeEndDuel, { title: 'Probe' })
    expect(ended.ok).toBe(true)
    expect(duelActive()).toBe(false)
    expect(getWebMcpTarget()).toBe('player')
  })

  it('refuses to start twice', async () => {
    setWebMcpContext(createMockCommandContext())
    await run(arcadeStartDuel, {})
    expect(await run(arcadeStartDuel, {})).toHaveProperty('error')
  })
})
