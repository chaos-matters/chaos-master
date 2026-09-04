import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearWebMcpContext, getWebMcpTarget, setWebMcpContext, setWebMcpTarget, } from '@/webmcp/contextBridge'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { duelActive, duelRivalSeat, runningDuel, stopDuel } from './duel'
import { beginDuel, finishDuel } from './duelActions'
import { agentDriving, resetPilot } from './pilot'

/**
 * The duel with nobody in the other seat.
 *
 * It exists so the split screen can be used without a model in the loop, and
 * the whole point is that it is the SAME duel: these cases pin the two things
 * that must differ (no pilot, no recording) and the several that must not.
 */
describe('a duel with no agent in it', () => {
  afterEach(() => {
    if (duelActive()) stopDuel()
    resetPilot()
    setWebMcpTarget('player')
    clearWebMcpContext('player')
    clearWebMcpContext('rival')
    vi.restoreAllMocks()
  })

  it('opens the split screen with nobody driving the other seat', () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)

    const started = beginDuel(ctx, { seconds: 90, opponent: 'none' })

    expect(started).toMatchObject({ ok: true, seconds: 90 })
    expect(duelActive()).toBe(true)
    // No pilot: nothing locks a seat, no step budget is spent, and the
    // narration rail stays out of the way.
    expect(agentDriving()).toBe(false)
    // And the tools keep pointing at the viewer. Moving the bridge would aim
    // any stray call at a flame nobody is playing.
    expect(getWebMcpTarget()).toBe('player')
    expect(ctx.arcade?.closeHub).toHaveBeenCalled()
  })

  it('records neither side, so an inspection leaves no takes behind', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)

    beginDuel(ctx, { seconds: 90, opponent: 'none' })

    expect(runningDuel()?.recording).toBe('none')
    expect(ctx.recorder?.start).not.toHaveBeenCalled()

    const ended = await finishDuel(ctx, 'stopped')

    expect(ended).toMatchObject({ ok: true, savedTakes: 0 })
    expect(ctx.recorder?.save).not.toHaveBeenCalled()
    expect(duelActive()).toBe(false)
  })

  it('still gives the stage two flames to draw', () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)

    beginDuel(ctx, { seconds: 90, opponent: 'none' })

    // The rival seat is real and mirrors the viewer's flame; without it the
    // split screen would be half a picture and prove nothing about layout.
    const rival = runningDuel()?.rival.flame()
    expect(rival).toBeDefined()
    expect(Object.keys(rival?.transforms ?? {})).toEqual(
      Object.keys(ctx.flameDescriptor().transforms),
    )
  })

  it('starts the rival from nothing when asked', () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)

    beginDuel(ctx, { seconds: 90, opponent: 'none', rivalFrom: 'blank' })

    expect(runningDuel()?.rival.flame().transforms).toEqual({})
  })

  it('opens on a 3D flame too', () => {
    const ctx = createMockCommandContext()
    const flame = createTestFlame()
    flame.renderSettings.dimensions = 3
    ctx.flameDescriptor = () => flame
    setWebMcpContext(ctx)

    expect(beginDuel(ctx, { seconds: 90, opponent: 'none' })).toMatchObject({
      ok: true,
    })
    expect(duelActive()).toBe(true)
    expect(duelRivalSeat()?.flame().renderSettings.dimensions).toBe(3)
  })

  it('starts a 3D duel from a 2D flame when asked to', () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    expect(ctx.flameDescriptor().renderSettings.dimensions ?? 2).toBe(2)

    // Only the agent starts a duel, on whatever the viewer has open — so this
    // is how a 3D duel is asked for without loading a 3D flame by hand first.
    expect(
      beginDuel(ctx, { seconds: 90, startFrom: 'random-3d', opponent: 'none' }),
    ).toMatchObject({ ok: true })

    expect(ctx.flameDescriptor().renderSettings.dimensions).toBe(3)
    expect(duelRivalSeat()?.flame().renderSettings.dimensions).toBe(3)
  })

  it('refuses a second duel on top of a running one', () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    beginDuel(ctx, { seconds: 90, opponent: 'none' })

    const second = beginDuel(ctx, { seconds: 90, opponent: 'none' })

    expect(second).toHaveProperty('error')
  })

  it('leaves the agent duel exactly as it was', () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)

    const started = beginDuel(ctx, { seconds: 90, opponent: 'ai' })

    expect(started).toMatchObject({ ok: true })
    // The two things solo turns off, still on for a real duel.
    expect(agentDriving()).toBe(true)
    expect(getWebMcpTarget()).toBe('rival')
    expect(runningDuel()?.recording).toBe('both')
  })
})
