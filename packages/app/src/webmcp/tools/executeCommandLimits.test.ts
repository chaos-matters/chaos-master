import '@/commands/builtins'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { duelActive, startDuel, stopDuel } from '@/arcade/duel'
import { resetPilot, startPilot } from '@/arcade/pilot'
import { recorderStream } from '@/recorder/recorder'
import { clearWebMcpContext, setWebMcpContext, setWebMcpTarget, } from '@/webmcp/contextBridge'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { executeCommandTool } from './executeCommand'

const run = async (args: unknown[] = [0.42]) =>
  (await executeCommandTool.execute(
    { commandId: 'flame.setExposure', args },
    {},
  )) as Record<string, unknown>

function duelWithClock(durationMs: number) {
  startDuel({
    rivalFlame: createTestFlame(),
    playerFlame: createTestFlame(),
    durationMs,
    recording: 'both',
  })
  startPilot({
    mode: 'duel',
    title: 'Duelling you',
    stepBudget: 60,
    allowed: ['flame.', 'camera.'],
    qualityRankAtStart: 1,
    seatId: 'rival',
    lock: 'seat',
  })
}

describe('execute_command against the duel clock', () => {
  afterEach(() => {
    if (duelActive()) stopDuel()
    resetPilot()
    clearWebMcpContext('player')
    clearWebMcpContext('rival')
    setWebMcpTarget('player')
    recorderStream('player').cancel()
    recorderStream('rival').cancel()
    vi.restoreAllMocks()
  })

  it('lets the agent work while the clock is running', async () => {
    setWebMcpContext(createMockCommandContext())
    duelWithClock(60_000)

    expect(await run()).toHaveProperty('success', true)
  })

  it('refuses once time is up', async () => {
    setWebMcpContext(createMockCommandContext())
    duelWithClock(0)

    const result = await run()

    // `startDuel` schedules the ending, but a background tab throttles timers:
    // without this the agent could keep editing while that timeout waits.
    expect(String(result.error)).toContain('Time is up')
  })

  it('leaves an ordinary lesson alone', async () => {
    setWebMcpContext(createMockCommandContext())
    startPilot({
      mode: 'teach',
      title: 'Teaching',
      stepBudget: 25,
      allowed: ['flame.'],
      qualityRankAtStart: 1,
    })

    expect(await run()).toHaveProperty('success', true)
  })
})
