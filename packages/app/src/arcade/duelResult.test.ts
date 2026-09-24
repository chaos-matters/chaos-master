import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { closeDuelView, duelActive, duelRivalSeat, duelShowing } from './duel'
import { beginDuel, finishDuel } from './duelActions'
import { powerCurveJudge } from './duelJudge'
import { clearDuelResult, duelResult, showDuelResult } from './duelResult'
import { pilot, resetPilot } from './pilot'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/** A flame with `count` transforms, each carrying one non-linear variation. */
function busyFlame(count: number): FlameDescriptor {
  const base = createMockCommandContext().flameDescriptor()
  const template = Object.values(base.transforms)[0]!
  const transforms = Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `t${i}`,
      {
        ...template,
        variations: {
          v0: { type: 'sphericalVar', weight: 1, visible: true },
          v1: { type: 'juliaVar', weight: 1, visible: true },
        },
      },
    ]),
  ) as FlameDescriptor['transforms']
  return { ...base, transforms }
}

describe('the duel ending', () => {
  afterEach(() => {
    clearDuelResult()
    closeDuelView()
    resetPilot()
    clearWebMcpContext('player')
    clearWebMcpContext('rival')
  })

  it('keeps the screen up and reports the duel', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    beginDuel(ctx, { seconds: 90, opponent: 'none' })

    await finishDuel(ctx, 'stopped')

    // The clock has stopped, but the split screen has not come down: the
    // card is read over both flames, still rendering.
    expect(duelActive()).toBe(false)
    expect(duelShowing()).toBe(true)
    expect(duelRivalSeat()).toBeDefined()

    const result = duelResult()
    expect(result).toBeDefined()
    expect(result?.reason).toBe('stopped')
    expect(result?.durationMs).toBe(90_000)
    expect(result?.id).toMatch(/^[0-9a-f]{7}$/)
    expect(result?.verdict.components).toHaveLength(4)
  })

  it('frees the seat only when the card is dismissed', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    beginDuel(ctx, { seconds: 90, opponent: 'none' })
    await finishDuel(ctx, 'stopped')

    clearDuelResult()

    expect(duelResult()).toBeUndefined()
    expect(duelShowing()).toBe(false)
    expect(duelRivalSeat()).toBeUndefined()
  })

  // The card of a duel whose takes were still saving when the rematch began
  // landed on top of the new duel, and dismissing it closed the new duel
  // under the agent, whose tools then acted on the viewer's flame.
  it("never shows a finished duel's card over the rematch that began while it saved", async () => {
    const ctx = createMockCommandContext()
    let releaseSave!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseSave = resolve
    })
    ctx.recorder = {
      ...ctx.recorder!,
      save: vi.fn(() => gate),
    }
    setWebMcpContext(ctx)
    beginDuel(ctx, { seconds: 90, opponent: 'ai' })
    const finishing = finishDuel(ctx, 'finished')
    expect(beginDuel(ctx, { seconds: 90, opponent: 'ai' })).toHaveProperty(
      'ok',
      true,
    )

    releaseSave()
    await finishing

    expect(duelActive()).toBe(true)
    expect(duelResult()).toBeUndefined()
  })

  it('dismissing a card closes only a duel that is showing its result', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    beginDuel(ctx, { seconds: 90, opponent: 'ai' })
    await finishDuel(ctx, 'stopped')
    const stale = duelResult()!
    beginDuel(ctx, { seconds: 90, opponent: 'ai' })
    // Whatever put a card up, dismissing it must leave a running duel alone.
    showDuelResult(stale)

    clearDuelResult()

    expect(duelResult()).toBeUndefined()
    expect(duelActive()).toBe(true)
    expect(pilot().phase).toBe('driving')
  })

  it('takes the old result card down when a rematch starts', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    beginDuel(ctx, { seconds: 90, opponent: 'none' })
    await finishDuel(ctx, 'stopped')
    expect(duelResult()).toBeDefined()

    // The rematch, started while the card is still up: the card covered the
    // new duel's End button.
    const again = beginDuel(ctx, { seconds: 90, opponent: 'none' })

    expect(again).toHaveProperty('ok', true)
    expect(duelActive()).toBe(true)
    expect(duelResult()).toBeUndefined()
  })
})

describe('powerCurveJudge', () => {
  it('keeps rewarding work past the point the old caps stopped counting', () => {
    // Four transforms already saturate the score sheet's chaos cap. If the
    // curve capped too, these two would tie.
    const busy = powerCurveJudge.judge(busyFlame(4), busyFlame(4))
    const busier = powerCurveJudge.judge(busyFlame(12), busyFlame(4))

    expect(busy.winner).toBe('draw')
    expect(busier.winner).toBe('player')
    expect(busier.playerScore).toBeGreaterThan(busy.playerScore)
  })

  it('shows its working, so the card can explain the verdict', () => {
    const verdict = powerCurveJudge.judge(busyFlame(3), busyFlame(2))

    expect(verdict.components.map((c) => c.key)).toEqual([
      'complexity',
      'chaos',
      'symmetry',
      'energy',
    ])
    // The parts add up to the whole: a card that showed a breakdown which
    // did not reconstruct the score would be worse than showing none.
    const summed = Math.round(
      verdict.components.reduce((sum, c) => sum + c.player * c.weight, 0),
    )
    expect(summed).toBe(verdict.playerScore)
  })

  it('names the margin rather than the raw pair', () => {
    const verdict = powerCurveJudge.judge(busyFlame(8), busyFlame(2))
    expect(verdict.line).toMatch(/^Your flame wins by \d+\.$/)
  })
})
