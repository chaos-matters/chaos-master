import { describe, expect, it } from 'vitest'
import { duelHudModel, duelShares, formatDuelClock, MIN_HUD_SHARE, } from './duelHud'

describe('formatDuelClock', () => {
  it('counts down in m:ss and never shows a negative', () => {
    expect(formatDuelClock(180_000)).toBe('3:00')
    expect(formatDuelClock(61_000)).toBe('1:01')
    expect(formatDuelClock(500)).toBe('0:01')
    expect(formatDuelClock(0)).toBe('0:00')
    expect(formatDuelClock(-5000)).toBe('0:00')
  })
})

describe('duelShares', () => {
  it('splits the ring by ratio, because the score has no maximum', () => {
    expect(duelShares(60, 40).playerShare).toBeCloseTo(0.6)
    // The same lead at ten times the scale reads the same.
    expect(duelShares(600, 400).playerShare).toBeCloseTo(0.6)
  })

  it('halves it before either side has scored', () => {
    expect(duelShares(0, 0)).toEqual({ playerShare: 0.5, rivalShare: 0.5 })
  })

  it('leaves the losing side a visible sliver', () => {
    // A bare one-colour ring reads as broken, not as losing badly.
    expect(duelShares(0, 500).playerShare).toBeCloseTo(MIN_HUD_SHARE)
    expect(duelShares(500, 0).rivalShare).toBeCloseTo(MIN_HUD_SHARE)
  })

  it('always splits the whole ring', () => {
    for (const [p, r] of [
      [0, 0],
      [1, 0],
      [3, 7],
      [999, 1],
    ] as const) {
      const { playerShare, rivalShare } = duelShares(p, r)
      expect(playerShare + rivalShare).toBeCloseTo(1)
    }
  })
})

describe('duelHudModel', () => {
  const verdict = {
    winner: 'player' as const,
    playerScore: 70,
    rivalScore: 30,
    line: 'You lead',
    components: [],
  }

  it('derives the clock, the elapsed fraction and the shares together', () => {
    const model = duelHudModel({
      remainingMs: 45_000,
      durationMs: 180_000,
      verdict,
    })
    expect(model.clock).toBe('0:45')
    expect(model.elapsed).toBeCloseTo(0.75)
    expect(model.playerShare).toBeCloseTo(0.7)
    expect(model.leader).toBe('player')
    expect(model.urgent).toBe(false)
    expect(model.ready).toBe(false)
  })

  it('flags the last ten seconds', () => {
    expect(
      duelHudModel({ remainingMs: 10_001, durationMs: 60_000 }).urgent,
    ).toBe(false)
    expect(
      duelHudModel({ remainingMs: 10_000, durationMs: 60_000 }).urgent,
    ).toBe(true)
  })

  it('reads as a draw before the first score', () => {
    const model = duelHudModel({ remainingMs: 60_000, durationMs: 60_000 })
    expect(model.leader).toBe('draw')
    expect(model.playerShare).toBe(0.5)
    expect(model.elapsed).toBe(0)
  })

  it('carries the title the agent declared', () => {
    const model = duelHudModel({
      remainingMs: 1000,
      durationMs: 60_000,
      readyTitle: 'Ember lattice',
    })
    expect(model.ready).toBe(true)
    expect(model.readyTitle).toBe('Ember lattice')
  })
})
