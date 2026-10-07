/**
 * The affine terms an agent can keyframe, and what each one is.
 *
 * A 2D affine is `{ a b c / d e f }`: x' = a x + b y + c, y' = d x + e y + f.
 * A 3D affine is `{ a b c d / e f g h / i j k l }`: x' = a x + b y + c z + d,
 * and so on. The same letter is a different term in each: `d` is y-from-x in
 * 2D and the x translation in 3D. A transform keeps its own layout (a 3D
 * flame can still hold 2D-layout affines, which the 3D renderer maps), so the
 * catalog lists each affine's own terms and says what each one is.
 *
 * What a term is gets read off the renderer's own affine functions, not
 * copied: set that one term to 1, push the point (2, 3, 5) through, and see
 * which output moves and by how much.
 */
import '@/commands/builtins'
import { vec2f, vec3f } from 'typegpu/data'
import { describe, expect, it } from 'vitest'
import { preflightReplayCommand } from '@/commands/registry'
import { transformAffine } from '@/flame/affineTranform'
import { transformAffine3D } from '@/flame/affineTransform3D'
import { validateFlame } from '@/flame/schema/flameSchema'
import { applyTracksToFlame } from '@/utils/timeline'
import { AFFINE_EQUATIONS, AFFINE_TERMS } from './affineTerms'
import { buildAnimatableCatalog, buildTimelineSnapshot, } from './animatablePaths'
import type { CatalogEntry } from './animatablePaths'

type Layout = '2D' | '3D'
const KEYS: Record<Layout, string[]> = {
  '2D': ['a', 'b', 'c', 'd', 'e', 'f'],
  '3D': ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'],
}

/** What one term does, as the renderer applies it: `x from y`, `z translation`. */
function termMeaning(layout: Layout, key: string): string {
  const unit = Object.fromEntries(
    KEYS[layout].map((k) => [k, k === key ? 1 : 0]),
  )
  type Out = { x: number; y: number; z?: number }
  const out =
    layout === '3D'
      ? (transformAffine3D(unit as never, vec3f(2, 3, 5)) as unknown as Out)
      : (transformAffine(unit as never, vec2f(2, 3)) as unknown as Out)
  const components: Record<string, number> =
    out.z === undefined
      ? { x: out.x, y: out.y }
      : { x: out.x, y: out.y, z: out.z }
  const rows = Object.entries(components).filter(([, value]) => value !== 0)
  expect(rows).toHaveLength(1)
  const [row, value] = rows[0]!
  const from = { 1: 'translation', 2: 'x', 3: 'y', 5: 'z' }[value]
  return from === 'translation' ? `${row} translation` : `${row} from ${from}`
}

const affine3D = (seed: number) =>
  Object.fromEntries(KEYS['3D'].map((k, index) => [k, seed + index / 100]))
const affine2D = (seed: number) =>
  Object.fromEntries(KEYS['2D'].map((k, index) => [k, seed + index / 100]))

function flame(dims: 2 | 3, finalTransform?: Record<string, number>) {
  const affine = dims === 3 ? affine3D : affine2D
  return validateFlame({
    renderSettings: { dimensions: dims, exposure: 0.25, skipIters: 20 },
    transforms: {
      t1: {
        probability: 1,
        color: { x: 0.2, y: 0 },
        colorSpeed: 0.4,
        visible: true,
        preAffine: affine(0.1),
        postAffine: affine(0.5),
        variations: {
          v1: {
            type: dims === 3 ? 'linear3D' : 'linearVar',
            weight: 1,
            visible: true,
          },
        },
      },
    },
    ...(finalTransform ? { finalTransform } : {}),
  })
}

/** The one transform these flames have (transform ids are branded). */
const t1 = (f: ReturnType<typeof flame>) => Object.values(f.transforms)[0]!

function affineEntries(catalog: CatalogEntry[], prefix: string) {
  return catalog
    .filter((entry) => entry.path.startsWith(prefix))
    .map((entry) => ({
      key: entry.path.slice(prefix.length),
      current: entry.current,
      description: entry.description,
    }))
}

const track = (path: string, from: number, to: number) => ({
  path,
  keyframes: [
    { frame: 0, value: from },
    { frame: 30, value: to },
  ],
})

function expected(layout: Layout, affine: Record<string, number> | undefined) {
  return KEYS[layout].map((key) => ({
    key,
    current: affine?.[key],
    description: termMeaning(layout, key),
  }))
}

describe('the catalog lists each affine in its own layout', () => {
  it('a 3D flame: pre- and postAffine a-l, each named for its row or translation', () => {
    const f = flame(3)
    const catalog = buildAnimatableCatalog(f)
    for (const matrix of ['preAffine', 'postAffine'] as const) {
      expect(affineEntries(catalog, `transform.t1.${matrix}.`)).toEqual(
        expected('3D', t1(f)[matrix] as Record<string, number>),
      )
    }
  })

  it('a 2D flame: pre- and postAffine a-f, each named', () => {
    const f = flame(2)
    const catalog = buildAnimatableCatalog(f)
    for (const matrix of ['preAffine', 'postAffine'] as const) {
      expect(affineEntries(catalog, `transform.t1.${matrix}.`)).toEqual(
        expected('2D', t1(f)[matrix] as Record<string, number>),
      )
    }
  })

  it('a 2D flame switched to 3D keeps 2D-layout affines, and the catalog says so', () => {
    // flame.updateRenderSettings replaces renderSettings only; the transforms
    // keep their layout, and the 3D renderer maps a 2D-layout affine.
    const f = structuredClone(flame(2))
    f.renderSettings.dimensions = 3
    const catalog = buildAnimatableCatalog(f)
    expect(affineEntries(catalog, 'transform.t1.preAffine.')).toEqual(
      expected('2D', t1(f).preAffine as Record<string, number>),
    )
  })

  it('the final transform: a-l on a 3D flame, a-f on a 2D one, named', () => {
    const f3 = flame(3, affine3D(0.7))
    expect(
      affineEntries(buildAnimatableCatalog(f3), 'finalTransform.'),
    ).toEqual(expected('3D', f3.finalTransform as Record<string, number>))
    const f2 = flame(2, affine2D(0.7))
    expect(
      affineEntries(buildAnimatableCatalog(f2), 'finalTransform.'),
    ).toEqual(expected('2D', f2.finalTransform as Record<string, number>))
  })

  it('a 3D flame switched to 2D: a-f, named as the 2D renderer reads them', () => {
    // The 2D renderer reads a-f in the 2D layout and ignores g-l, whatever
    // layout the affine was written in.
    const f = structuredClone(flame(3, affine3D(0.7)))
    f.renderSettings.dimensions = 2
    const catalog = buildAnimatableCatalog(f)
    for (const matrix of ['preAffine', 'postAffine'] as const) {
      expect(affineEntries(catalog, `transform.t1.${matrix}.`)).toEqual(
        expected('2D', t1(f)[matrix] as Record<string, number>),
      )
    }
    expect(affineEntries(catalog, 'finalTransform.')).toEqual(
      expected('2D', f.finalTransform as Record<string, number>),
    )
    const built = buildTimelineSnapshot(
      { durationFrames: 30, tracks: [track('transform.t1.preAffine.l', 0, 1)] },
      catalog,
    )
    expect(built.ok ? '' : built.error).toContain('2D layout')
  })

  it('a 3D flame without a final transform gets the 3D one the timeline creates', () => {
    const f = flame(3)
    expect(
      affineEntries(buildAnimatableCatalog(f), 'finalTransform.').map(
        (entry) => [entry.key, entry.description],
      ),
    ).toEqual(KEYS['3D'].map((key) => [key, termMeaning('3D', key)]))
  })
})

describe('agents can keyframe the 3D terms, and the timeline drives them', () => {
  const paths3D = [
    'transform.t1.preAffine.l',
    'transform.t1.postAffine.g',
    'finalTransform.k',
  ]

  it('accepts g-l on a 3D flame and applies them at the frame', () => {
    const f = flame(3, affine3D(0.7))
    const built = buildTimelineSnapshot(
      { durationFrames: 30, tracks: paths3D.map((p) => track(p, 0, 2)) },
      buildAnimatableCatalog(f),
    )
    expect(built.ok).toBe(true)
    if (!built.ok) return
    // A recorded take replays the same snapshot through timeline.loadTimeline.
    expect(
      preflightReplayCommand('timeline.loadTimeline', [built.snapshot]),
    ).toBeUndefined()
    const posed = structuredClone(f)
    applyTracksToFlame(built.snapshot.tracks, posed, 15)
    expect([
      (t1(posed).preAffine as Record<string, number>).l,
      (t1(posed).postAffine as Record<string, number>).g,
      (posed.finalTransform as Record<string, number>).k,
    ]).toEqual([1, 1, 1])
  })

  it('refuses g-l on a 2D-layout affine and says why, not "Unknown path"', () => {
    const f = flame(2)
    const built = buildTimelineSnapshot(
      {
        durationFrames: 30,
        tracks: [track('transform.t1.preAffine.g', 0, 1)],
      },
      buildAnimatableCatalog(f),
    )
    expect(built.ok).toBe(false)
    const error = built.ok ? '' : built.error
    expect(error).not.toContain('Unknown path')
    expect(error).toContain('2D layout')
    expect(error).toContain('a-f')
  })
})

describe('the timeline keeps a 2D-layout final transform 2D', () => {
  // A take recorded on a 3D flame, replayed after the flame (or its final
  // transform) went back to 2D: g-l tracks are there, the final is a-f.
  const recorded = () => {
    const built = buildTimelineSnapshot(
      {
        durationFrames: 30,
        tracks: [
          track('finalTransform.a', 0, 2),
          track('finalTransform.k', 0, 2),
        ],
      },
      buildAnimatableCatalog(flame(3, affine3D(0.7))),
    )
    if (!built.ok) throw new Error(built.error)
    return built.snapshot.tracks
  }

  for (const dims of [2, 3] as const) {
    it(`a ${dims}D flame with a 2D-layout final: a-f move, g-l are not added`, () => {
      // Set after loading: loading a 3D flame promotes its final to 3D.
      const f = structuredClone(flame(dims))
      f.finalTransform = affine2D(0.7) as typeof f.finalTransform
      applyTracksToFlame(recorded(), f, 15)
      expect(Object.keys(f.finalTransform!).sort()).toEqual(KEYS['2D'])
      expect((f.finalTransform as Record<string, number>).a).toBe(1)
    })
  }
})

describe('the equations agents are given say what the renderer does', () => {
  /** Each term of `"{a-f}: x'=ax+by+c, y'=dx+ey+f"`, as `x from y` / `x translation`. */
  function readEquations(equations: string): Record<string, string> {
    const [range, rows] = equations.split(': ')
    const meanings: Record<string, string> = {}
    for (const row of rows!.split(', ')) {
      const [lhs, rhs] = row.split('=')
      const output = lhs!.replace("'", '')
      for (const term of rhs!.split('+')) {
        const [key, input] = [term[0]!, term[1]]
        meanings[key] = input
          ? `${output} from ${input}`
          : `${output} translation`
      }
    }
    const keys = Object.keys(meanings)
    expect(range).toBe(`{${keys[0]}-${keys.at(-1)}}`)
    return meanings
  }

  for (const layout of ['2D', '3D'] as const) {
    it(`${layout}: every term, as the renderer applies it and as the catalog names it`, () => {
      const read = readEquations(AFFINE_EQUATIONS[layout])
      expect(Object.keys(read)).toEqual(KEYS[layout])
      expect(read).toEqual(
        Object.fromEntries(
          KEYS[layout].map((key) => [key, termMeaning(layout, key)]),
        ),
      )
      expect(read).toEqual(AFFINE_TERMS[layout])
    })
  }
})
