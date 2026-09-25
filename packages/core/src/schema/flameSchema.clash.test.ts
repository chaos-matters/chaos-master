/**
 * The Flame Clash fields a fight flame carries: `team` and `from2D` on a
 * transform, and `renderSettings.clash`. Only the stage builds a fight flame,
 * and it never validates one. Validation strips all three, so no flame that
 * arrives through set_flame, a JSON import, a share link or autosave can
 * switch the renderer to team-locked walkers or to a fighter's 2D functions,
 * and a stray value in them can never make a flame fail to load.
 */
import { describe, expect, it } from 'vitest'
import { renderSettingsDefault, tryValidateFlame, validateFlame, } from './flameSchema'

const transform = (extra: Record<string, unknown> = {}) => ({
  probability: 1,
  preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
  postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
  color: { x: 0, y: 0 },
  ...extra,
  variations: { v1: { type: 'linearVar', weight: 1 } },
})

const flame = (
  dimensions: 2 | 3,
  fight: {
    a?: Record<string, unknown>
    b?: Record<string, unknown>
    clash?: Record<string, unknown>
  } = {},
) => ({
  renderSettings: {
    ...renderSettingsDefault,
    dimensions,
    ...(fight.clash && { clash: fight.clash }),
  },
  transforms: { a1: transform(fight.a), b1: transform(fight.b) },
})

const fightFields = {
  a: { team: 'A', from2D: true },
  b: { team: 'B' },
  clash: { split: 0.8, leakA: 0.2, leakB: 0 },
}

function expectNoFightFields(parsed: ReturnType<typeof validateFlame>) {
  expect(parsed.renderSettings).not.toHaveProperty('clash')
  for (const t of Object.values(parsed.transforms)) {
    expect(t).not.toHaveProperty('team')
    expect(t).not.toHaveProperty('from2D')
  }
}

describe.each([2, 3] as const)('the %dD flame schema', (dimensions) => {
  it("strips a fight flame's teams, 2D marks and fight uniforms", () => {
    expectNoFightFields(validateFlame(flame(dimensions, fightFields)))
  })

  it('adds none of them to a flame without them', () => {
    expectNoFightFields(validateFlame(flame(dimensions)))
  })

  it('loads a flame whose fight fields hold stray values, without them', () => {
    const stray = flame(dimensions, {
      a: { team: 'C', from2D: 'yes' },
      b: { team: 7 },
      clash: { split: 2, leakA: -1 },
    })
    const parsed = tryValidateFlame(stray)
    expect(parsed).toBeDefined()
    expectNoFightFields(parsed!)
  })
})
