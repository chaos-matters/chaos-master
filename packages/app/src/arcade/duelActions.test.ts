import { afterEach, describe, expect, it, vi } from 'vitest'
import { recorderStream } from '@/recorder/recorder'
import { clearWebMcpContext, getWebMcpTarget, setWebMcpContext, setWebMcpTarget, } from '@/webmcp/contextBridge'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { duelActive, startDuel, stopDuel } from './duel'
import { finishDuel } from './duelActions'
import { pilot, resetPilot, startPilot } from './pilot'
import type { CommandContext } from '@/commands/types'
import type { RecordedSession } from '@/recorder/schema'

function recorderFacade(
  save: (session: RecordedSession, name: string) => Promise<void>,
): NonNullable<CommandContext['recorder']> {
  return {
    isRecording: () => false,
    start: () => ({ ok: true }),
    stop: () => undefined,
    cancel: () => {},
    save,
    openReplay: () => {},
    actionCount: () => 0,
  }
}

function beginDuel() {
  startDuel({
    rivalFlame: createTestFlame(),
    playerFlame: createTestFlame(),
    durationMs: 60_000,
    recording: 'both',
    now: 0,
  })
  startPilot({
    mode: 'duel',
    title: 'Duelling you',
    stepBudget: 60,
    allowed: ['flame.'],
    qualityRankAtStart: 1,
    seatId: 'rival',
    lock: 'seat',
    now: 0,
  })
  setWebMcpTarget('rival')
}

describe('finishDuel', () => {
  afterEach(() => {
    if (duelActive()) stopDuel()
    resetPilot()
    clearWebMcpContext('player')
    clearWebMcpContext('rival')
    recorderStream('player').cancel()
    recorderStream('rival').cancel()
    vi.restoreAllMocks()
  })

  it('is the one path that ends everything at once', async () => {
    const saved: string[] = []
    const ctx = createMockCommandContext()
    ctx.recorder = recorderFacade((_session: RecordedSession, name: string) => {
      saved.push(name)
      return Promise.resolve()
    })
    setWebMcpContext(ctx)
    beginDuel()

    const result = await finishDuel(ctx, 'stopped', { title: 'Probe' })

    if ('error' in result) throw new Error(result.error)
    // The duel, the pilot, both streams and the bridge target, together.
    expect(duelActive()).toBe(false)
    expect(pilot().phase).toBe('ended')
    expect(recorderStream('player').isRecording()).toBe(false)
    expect(recorderStream('rival').isRecording()).toBe(false)
    expect(getWebMcpTarget()).toBe('player')
    // Filed under the duel's own names, not "Lesson".
    expect(saved).toEqual([
      'Duel: Probe — your flame',
      "Duel: Probe — the agent's flame",
    ])
    expect(result.savedTakes).toBe(2)
    expect(result.winner).toBeDefined()
  })

  it('refuses when no duel is running', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    expect(await finishDuel(ctx, 'stopped', {})).toHaveProperty('error')
  })

  it('still ends the duel when saving throws', async () => {
    const ctx = createMockCommandContext()
    ctx.recorder = recorderFacade(() =>
      Promise.reject(new Error('library unavailable')),
    )
    setWebMcpContext(ctx)
    beginDuel()

    const result = await finishDuel(ctx, 'finished', { title: 'Probe' })

    // A failed write must never strand the stage.
    if ('error' in result) throw new Error(result.error)
    expect(duelActive()).toBe(false)
    expect(result.savedTakes).toBe(0)
  })

  it('falls back to the title the agent declared when ready', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    beginDuel()
    const { markDuelReady } = await import('./duel')
    markDuelReady({ title: 'Ember lattice' })

    const result = await finishDuel(ctx, 'finished', {})

    if ('error' in result) throw new Error(result.error)
    expect(result.title).toBe('Ember lattice')
  })
})
