import { describe, expect, it } from 'vitest'
import { createTestFlame } from '@/webmcp/testUtils'
import { CARD, cardQuality, HALF_TRACK, toCardModel } from './duelCard'
import type { DuelComponent, DuelVerdict } from '@/arcade/duelJudge'
import type { DuelResult } from '@/arcade/duelResult'

function component(
  key: DuelComponent['key'],
  player: number,
  rival: number,
): DuelComponent {
  return {
    key,
    label: key[0]!.toUpperCase() + key.slice(1),
    detail: 'why it counts',
    player,
    rival,
    weight: 25,
  }
}

function result(verdict: Partial<DuelVerdict> = {}): DuelResult {
  return {
    verdict: {
      winner: 'player',
      line: 'Your flame wins by 37.',
      playerScore: 342,
      rivalScore: 305,
      components: [
        component('complexity', 4.6, 3.1),
        component('chaos', 0, 0),
        component('symmetry', 4.7, 4.7),
        component('energy', 10, 2),
      ],
      ...verdict,
    },
    reason: 'finished',
    playerName: 'Ember',
    rivalName: 'Cinder',
    winnerFlame: createTestFlame(),
    archetype: 'Chaotic Vortex',
    durationMs: 120_000,
    id: 'abc1234',
    savedTakes: 2,
  }
}

describe('toCardModel', () => {
  it('lays out four components and the totals as a fifth row', () => {
    const model = toCardModel(result())
    expect(model.rows).toHaveLength(5)
    expect(model.rows.map((row) => row.label)).toEqual([
      'Complexity',
      'Chaos',
      'Symmetry',
      'Energy',
      'Score',
    ])
    const score = model.rows[4]!
    expect(score.headline).toBe(true)
    expect([score.player, score.rival]).toEqual([342, 305])
  })

  it('draws nothing for a component both sides scored zero on', () => {
    // The v1 pill filled from the ratio alone, so 0.0 against 0.0 drew the
    // same two half-tracks as 4.7 against 4.7.
    const model = toCardModel(result())
    const [, chaos, symmetry] = model.rows
    expect(chaos!.playerFill).toBe(0)
    expect(chaos!.rivalFill).toBe(0)
    expect(symmetry!.playerFill).toBeCloseTo(0.47)
    expect(symmetry!.rivalFill).toBeCloseTo(0.47)
  })

  it('runs the winner of the totals row all the way to the tip', () => {
    const model = toCardModel(result())
    const score = model.rows[4]!
    expect(score.playerFill).toBe(1)
    expect(score.rivalFill).toBeCloseTo(305 / 342)
  })

  it('fills both sides of the totals row on a draw', () => {
    const model = toCardModel(
      result({ winner: 'draw', playerScore: 300, rivalScore: 300 }),
    )
    expect(model.rows[4]!.playerFill).toBe(1)
    expect(model.rows[4]!.rivalFill).toBe(1)
    expect(model.title).toBe('Dead heat')
  })

  it('names the winner and nobody else', () => {
    expect(toCardModel(result()).title).toBe('Ember')
    expect(toCardModel(result({ winner: 'rival' })).title).toBe('Cinder')
  })
})

describe('the card geometry', () => {
  it('keeps every region inside the rim, and the rim unbroken', () => {
    const inner = CARD.rim.inset + CARD.rim.width
    const bottom = CARD.height - inner
    expect(CARD.badge.x).toBeGreaterThanOrEqual(inner)
    expect(CARD.badge.y).toBeGreaterThanOrEqual(inner)
    expect(CARD.close.x + CARD.close.size).toBeLessThanOrEqual(
      CARD.width - inner,
    )
    // A 12px face's descender reaches about a quarter of its size below the
    // baseline; the watermark has to clear the rim by more than that.
    expect(
      bottom - (CARD.watermark.baseline + CARD.watermark.size / 4),
    ).toBeGreaterThanOrEqual(8)
  })

  it('overlaps the badge and the title bar by exactly ten pixels', () => {
    expect(CARD.badge.x + CARD.badge.width - CARD.titleBar.x).toBe(10)
  })

  it('stacks the five rows without overlap, clear of the watermark', () => {
    const rows = CARD.rows
    expect(rows.pitch).toBeGreaterThan(rows.height)
    const last = rows.y + rows.pitch * 4 + rows.height
    expect(last).toBeLessThanOrEqual(
      CARD.watermark.baseline - CARD.watermark.size,
    )
  })

  it('clears the badge above and the rows below with the flame window', () => {
    // The badge hangs past the title bar, and the window is full width, so it
    // is the badge and not the bar that sets the window's ceiling.
    expect(CARD.window.y).toBeGreaterThanOrEqual(
      CARD.badge.y + CARD.badge.height,
    )
    expect(CARD.window.y + CARD.window.height).toBeLessThanOrEqual(CARD.rows.y)
  })

  it('spends the largest region on the flame', () => {
    const window = CARD.window.width * CARD.window.height
    const rows = CARD.rows.width * (CARD.rows.pitch * 4 + CARD.rows.height)
    expect(window).toBeGreaterThan(rows)
  })

  it('splits the row into two equal halves either side of the seam', () => {
    expect(HALF_TRACK).toBe(160)
    expect(HALF_TRACK * 2 + CARD.rows.value * 2 + CARD.rows.gap * 2).toBe(
      CARD.rows.width,
    )
  })
})

describe('cardQuality', () => {
  it('floors a grainy preset and pulls ultra back', () => {
    expect(cardQuality(0.75)).toBe(0.97)
    expect(cardQuality(0.95)).toBe(0.97)
    expect(cardQuality(0.995)).toBe(0.99)
    expect(cardQuality(0.98)).toBe(0.98)
  })
})
