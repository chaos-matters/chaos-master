/**
 * The clash team kernel: which flames get it, what it compiles to, and what
 * the pipelines write for it. The byte-for-byte guard for flames without
 * teams is ifsPipeline.wgslGolden.test.ts; this file covers the flames with.
 */
import { describe, expect, it } from 'vitest'
import { CLASH_TEAM_BLOCK, clashTeamsOf, clashTeamsSignature, clashTeamValues, } from './clashTeams'
import { examples } from './examples'
import { buildIfsPipeline, resolveIfsWgsl } from './ifsPipelineWgsl.testUtils'
import type { FlameDescriptor, TransformFunction, TransformRecord, } from './schema/flameSchema'

/** Two flames' transforms in one record, prefixed, each on its own team. */
function teamed(
  a: TransformRecord,
  b: TransformRecord,
  tag: { a?: 'A' | 'B'; b?: 'A' | 'B' } = { a: 'A', b: 'B' },
): TransformRecord {
  const out: Record<string, TransformFunction> = {}
  for (const [tid, t] of Object.entries(a)) {
    out[`a_${tid}`] = tag.a ? { ...t, team: tag.a } : { ...t }
  }
  for (const [tid, t] of Object.entries(b)) {
    out[`b_${tid}`] = tag.b ? { ...t, team: tag.b } : { ...t }
  }
  return out
}

/** The same record with every team tag removed. */
function untagged(transforms: TransformRecord): TransformRecord {
  return Object.fromEntries(
    Object.entries(transforms).map(([tid, t]) => {
      const { team: _team, ...rest } = t
      return [tid, rest]
    }),
  )
}

const galaxy = examples.example37.transforms
const jellyfish = examples.example38.transforms
const flat1 = examples.example1.transforms
const flat2 = examples.example2.transforms

describe('clashTeamsOf', () => {
  it('is off for a flame without teams', () => {
    expect(clashTeamsOf(galaxy).enabled).toBe(false)
  })

  it('is off for a blend, which passes no transforms', () => {
    expect(clashTeamsOf(undefined).enabled).toBe(false)
  })

  it('is off when only some transforms name a team', () => {
    const partly = teamed(galaxy, jellyfish, { a: 'A' })
    expect(clashTeamsOf(partly).enabled).toBe(false)
  })

  it('is off when every transform is on the same team', () => {
    const oneSide = teamed(galaxy, jellyfish, { a: 'A', b: 'A' })
    expect(clashTeamsOf(oneSide).enabled).toBe(false)
  })

  it('lists each team in record order when both are present', () => {
    const teams = clashTeamsOf(teamed(galaxy, jellyfish))
    expect(teams.enabled).toBe(true)
    expect(teams.a).toEqual(Object.keys(galaxy).map((t) => `a_${t}`))
    expect(teams.b).toEqual(Object.keys(jellyfish).map((t) => `b_${t}`))
  })

  it('adds nothing to the cache key of a flame without teams', () => {
    expect(clashTeamsSignature(clashTeamsOf(galaxy))).toEqual({})
    const teams = clashTeamsOf(teamed(galaxy, jellyfish))
    expect(clashTeamsSignature(teams)).toEqual({
      clashTeams: { a: teams.a, b: teams.b },
    })
  })
})

describe('clashTeamValues', () => {
  const withClash = (clash?: FlameDescriptor['renderSettings']['clash']) => ({
    renderSettings: { ...examples.example37.renderSettings, clash },
  })

  it('defaults to an even split and no leak', () => {
    expect(clashTeamValues(withClash())).toEqual({
      split: 0.5,
      leakA: 0,
      leakB: 0,
    })
  })

  it('passes the flame values through and holds them to 0..1', () => {
    expect(
      clashTeamValues(withClash({ split: 0.8, leakA: 0.25, leakB: 0 })),
    ).toEqual({ split: 0.8, leakA: 0.25, leakB: 0 })
    expect(
      clashTeamValues(withClash({ split: 1.5, leakA: -1, leakB: Number.NaN })),
    ).toEqual({ split: 1, leakA: 0, leakB: 0 })
  })
})

describe('the walker split', () => {
  // The WGSL puts walker i on team A when i % 1024 < split * 1024; this is
  // the same rule, so the share of walkers per team can be read off it.
  const onA = (i: number, split: number) =>
    i % CLASH_TEAM_BLOCK < split * CLASH_TEAM_BLOCK
  const shareOnA = (split: number, walkers = 1e5) => {
    let n = 0
    for (let i = 0; i < walkers; i++) if (onA(i, split)) n++
    return n / walkers
  }

  it('gives team A the split share of walkers', () => {
    for (const split of [0, 0.2, 0.5, 0.8, 0.97, 1]) {
      expect(shareOnA(split)).toBeCloseTo(split, 2)
    }
  })

  it('is the rule the compiled setter uses', () => {
    const wgsl = resolveIfsWgsl({
      transforms: teamed(galaxy, jellyfish),
      dims: 3,
    })
    expect(wgsl).toContain(`pointIndex % ${CLASH_TEAM_BLOCK}u`)
    expect(wgsl).toContain(`split * ${CLASH_TEAM_BLOCK}.0`)
  })
})

describe.each([
  ['3D', 3 as const, galaxy, jellyfish],
  ['2D', 2 as const, flat2, flat1],
])('the %s pipeline with two teams', (_name, dims, a, b) => {
  const transforms = teamed(a, b)
  const wgsl = resolveIfsWgsl({ transforms, dims })

  it('compiles the team kernel', () => {
    expect(wgsl).toContain('var<private> clashTeam')
    expect(wgsl).toContain('struct ClashTeamUniforms')
    expect(wgsl).toContain('fn clashIndexHash(pointIndex: u32) -> u32')
  })

  it('deals each walker its team where its index is hashed for its seed', () => {
    // So the compute entry is the one a flame without teams compiles, with
    // the team's hash in place of the plain one.
    const entry = (code: string) => code.slice(code.indexOf('@compute'))
    const plain = entry(
      resolveIfsWgsl({ transforms: untagged(transforms), dims }),
    )
    expect(plain).toMatch(/\bhash\(pointIndex\)/)
    expect(entry(wgsl)).toBe(
      plain.replace(/\bhash\(pointIndex\)/, 'clashIndexHash(pointIndex)'),
    )
  })

  const step = wgsl.slice(wgsl.indexOf('fn executeRandomFlame'))

  it('draws each team only from its own transforms', () => {
    // The step sums each team's probabilities, decides a leak, then branches
    // on the team: each branch opens with its pick against its team's total.
    const [, teamA = '', teamB = ''] = step.split(
      /let flameIndex = random\(\) \* total[AB];/,
    )
    const picks = (branch: string) =>
      [...branch.matchAll(/let u = flameUniforms\.flame(\w+);/g)].map(
        (m) => m[1],
      )
    expect(picks(teamA)).toEqual(Object.keys(a).map((tid) => `a_${tid}`))
    expect(picks(teamB)).toEqual(Object.keys(b).map((tid) => `b_${tid}`))
    const summed = (team: 'A' | 'B') =>
      [
        ...step.matchAll(
          /total([AB]) \+= flameUniforms\.flame(\w+)\.probability;/g,
        ),
      ]
        .filter((m) => m[1] === team)
        .map((m) => m[2])
    expect(summed('A')).toEqual(picks(teamA))
    expect(summed('B')).toEqual(picks(teamB))
  })

  it('walks a team with no live map on the other team', () => {
    // A team whose probabilities sum to 0 would pick no map, and its walkers
    // would sit where they started, drawn as a bright ball. After the leak,
    // before the branch, such a walker changes team.
    const leak = step.indexOf('clash.leakB')
    const fallback = step.search(
      /if \(team == 0u && totalA <= 0\.0\) \{\s*team = 1u;\s*\} else if \(team == 1u && totalB <= 0\.0\) \{\s*team = 0u;\s*\}/,
    )
    const branch = step.search(/let flameIndex = random\(\) \* totalA;/)
    expect(leak).toBeGreaterThan(-1)
    expect(fallback).toBeGreaterThan(leak)
    expect(branch).toBeGreaterThan(fallback)
  })

  it('compiles the ordinary shader once a tag is missing', () => {
    const partly = teamed(a, b, { a: 'A' })
    expect(resolveIfsWgsl({ transforms: partly, dims })).toBe(
      resolveIfsWgsl({ transforms: untagged(transforms), dims }),
    )
  })

  it('writes the fight uniforms on every update', () => {
    const pipeline = buildIfsPipeline({ transforms, dims })
    const flame = {
      ...(dims === 3 ? examples.example37 : examples.example2),
      transforms,
    }
    pipeline.update({
      ...flame,
      renderSettings: {
        ...flame.renderSettings,
        clash: { split: 0.7, leakA: 0.3, leakB: 0.05 },
      },
    })
    const written = pipeline.writes.find(
      (w): w is Record<string, unknown> =>
        typeof w === 'object' && w !== null && 'clashTeams' in w,
    )
    expect(written?.clashTeams).toEqual({ split: 0.7, leakA: 0.3, leakB: 0.05 })
  })
})

describe('a flame without teams', () => {
  it('writes no fight uniforms', () => {
    const pipeline = buildIfsPipeline({ transforms: galaxy, dims: 3 })
    pipeline.update(examples.example37)
    const flameWrites = pipeline.writes.filter(
      (w) =>
        typeof w === 'object' &&
        w !== null &&
        Object.keys(w).some((k) => k.startsWith('flame')),
    )
    expect(flameWrites.length).toBeGreaterThan(0)
    for (const w of flameWrites) expect(w).not.toHaveProperty('clashTeams')
  })
})
