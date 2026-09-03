import { describe, expect, it } from 'vitest'
import { createTestFlame } from '@/webmcp/testUtils'
import { calculateFlameStats } from '@/webmcp/tools/scoreFlame'
import { scoreSheetJudge } from './duelJudge'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/** A flame with more transforms scores higher on the existing sheet. */
function richer(): FlameDescriptor {
  const flame = createTestFlame()
  const [firstId, first] = Object.entries(flame.transforms)[0]!
  return {
    ...flame,
    transforms: {
      ...flame.transforms,
      [`${firstId}_extra`]: JSON.parse(JSON.stringify(first)),
    },
  }
}

describe('scoreSheetJudge', () => {
  it('gives the win to the higher score sheet', () => {
    const plain = createTestFlame()
    const strong = richer()
    expect(calculateFlameStats(strong).powerLevel).toBeGreaterThan(
      calculateFlameStats(plain).powerLevel,
    )
    expect(scoreSheetJudge.judge(strong, plain).winner).toBe('player')
    expect(scoreSheetJudge.judge(plain, strong).winner).toBe('rival')
  })

  it('calls two equal flames a draw and always explains itself', () => {
    const flame = createTestFlame()
    const verdict = scoreSheetJudge.judge(flame, flame)
    expect(verdict.winner).toBe('draw')
    expect(verdict.line.length).toBeGreaterThan(10)
    expect(verdict.playerScore).toBe(verdict.rivalScore)
  })
})
