import { describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { createTestFlame } from '@/webmcp/testUtils'
import { calculateFlameStats } from '@/webmcp/tools/scoreFlame'
import { powerCurveJudge, scoreSheetJudge } from './duelJudge'
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

/** The verdict's ceiling: all four inputs at their cap of 10. */
const CEILING = 678

function withExposure(flame: FlameDescriptor, exposure: number) {
  const copy = deepClone(flame)
  copy.renderSettings.exposure = exposure
  return copy
}

describe('powerCurveJudge: the energy term', () => {
  // Energy is 2 exposure + 2 vibrancy + 5 colour speed, and its curve is
  // 10 E / (E + 4). At the default vibrancy and colour speed exposure -3.5
  // put E on the pole: the result card printed -Infinity, -3.55 scored
  // 10,474 and -3.45 scored -9,526 (arcade audit, finding 3).
  it('scores every exposure the schema allows 0..678, rising with it', () => {
    const coarse = Array.from({ length: 161 }, (_, i) => -8 + i / 10)
    const nearPole = Array.from({ length: 21 }, (_, i) => -3.6 + i / 100)
    const exposures = [
      ...new Set([...coarse, ...nearPole].map((x) => Number(x.toFixed(2)))),
    ].sort((a, b) => a - b)
    const flame = examples.example1
    const scores = exposures.map(
      (x) => powerCurveJudge.judge(withExposure(flame, x), flame).playerScore,
    )
    const wrong = exposures.flatMap((x, i) => {
      const score = scores[i]!
      const outside = !(score >= 0 && score <= CEILING)
      const falls = i > 0 && score < scores[i - 1]!
      return outside || falls ? [`exposure ${x}: ${score}`] : []
    })
    expect(wrong).toEqual([])
  })

  // The darkest bundled examples, 3D ones with a negative exposure, scored
  // below 0 on the verdict: example32 and example33 (arcade audit, finding
  // 11).
  it('scores no bundled example below 0, on the verdict or the HUD', () => {
    const negative = Object.entries(examples).flatMap(([name, flame]) => {
      const verdict = powerCurveJudge.judge(flame, flame).playerScore
      const hud = scoreSheetJudge.judge(flame, flame).playerScore
      return verdict < 0 || hud < 0 ? [`${name}: ${verdict}, HUD ${hud}`] : []
    })
    expect(negative).toEqual([])
  })
})
