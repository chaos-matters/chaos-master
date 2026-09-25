import '@/commands/builtins'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAnimatableCatalog } from '@/arcade/animatablePaths'
import { pilot, resetPilot } from '@/arcade/pilot'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, unnamedWriteCount, } from '@/recorder/recorder'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { arcadeEndCinema, arcadeGetAnimatablePaths, arcadeSetKeyframes, arcadeStartCinema, } from './arcadeCinema'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/** A mock whose recorder hands back a take, the way a real one does. */
function ctxWithRecorder() {
  const ctx = createMockCommandContext()
  const stopped = {
    version: 1,
    actions: [{ t: 0, id: 'timeline.loadTimeline', args: [] }],
  }
  ctx.recorder!.stop = vi.fn(() => stopped as never)
  setWebMcpContext(ctx)
  return ctx
}

/**
 * The rail and the recording have to agree about how many steps happened.
 * They used to disagree by one per keyframe write: the tool logged one line
 * and the recorder wrote two, so a seven-call take replayed with seven extra
 * steps pointing at an animation toggle that never moved.
 */
describe('Cinema records one action per tool call', () => {
  afterEach(() => {
    resetPilot()
    cancelSessionRecording()
    clearWebMcpContext()
  })

  /** The mock context has no view block; Cinema only needs these two. */
  const viewMock = () => ({
    setQualityPreset: vi.fn(),
    setAdaptiveFilter: vi.fn(),
    setStochasticFilter: vi.fn(),
    setFlyMode: vi.fn(),
    setShowTimeline: vi.fn(),
  })

  const TRACKS = [
    {
      path: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 59, value: 1.4 },
      ],
    },
  ]

  it('writes exactly one action per arcade_set_keyframes call', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    await arcadeStartCinema.execute({}, {})
    expect(startSessionRecording(ctx.flameDescriptor())).toEqual({ ok: true })

    await arcadeSetKeyframes.execute(
      { fps: 30, durationFrames: 60, tracks: TRACKS },
      {},
    )
    await arcadeSetKeyframes.execute(
      { fps: 30, durationFrames: 60, tracks: TRACKS },
      {},
    )

    const ids = stopSessionRecording()?.actions.map((a) => a.id) ?? []
    expect(ids).toEqual(['timeline.loadTimeline', 'timeline.loadTimeline'])
    // The snapshot is what turns animation on, so a separate toggle is noise.
    expect(ids).not.toContain('timeline.setAnimationEnabled')
  })

  it('carries animationEnabled in add mode too', async () => {
    // The mode the tool recommends ("one idea at a time"). If a merge ever
    // dropped the flag, removing the separate toggle would silently stop
    // animation for exactly the workflow the brief tells agents to use.
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    await arcadeStartCinema.execute({}, {})
    await arcadeSetKeyframes.execute(
      { fps: 30, durationFrames: 60, mode: 'replace', tracks: TRACKS },
      {},
    )
    await arcadeSetKeyframes.execute(
      {
        fps: 30,
        durationFrames: 60,
        mode: 'add',
        tracks: [
          {
            path: 'exposure',
            keyframes: [
              { frame: 0, value: -4 },
              { frame: 59, value: -3.6 },
            ],
          },
        ],
      },
      {},
    )
    const calls = vi.mocked(ctx.timeline.edit!.load).mock.calls
    expect(calls).toHaveLength(2)
    // The flag, which is the whole point: what "add" merges into comes from
    // the live timeline, and this mock's tracks() does not follow its own
    // load() — merging itself is covered in animatablePaths.test.ts.
    expect(calls[1]?.[0]?.animationEnabled).toBe(true)
  })

  it('still applies the snapshot that carries animationEnabled', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    await arcadeStartCinema.execute({}, {})
    await arcadeSetKeyframes.execute(
      { fps: 30, durationFrames: 60, tracks: TRACKS },
      {},
    )
    const loaded = vi.mocked(ctx.timeline.edit!.load).mock.calls[0]?.[0]
    expect(loaded?.animationEnabled).toBe(true)
  })

  it('does not record opening a timeline that is already open', async () => {
    const ctx = createMockCommandContext()
    ctx.view = { ...viewMock(), showTimeline: () => true }
    setWebMcpContext(ctx)
    expect(startSessionRecording(ctx.flameDescriptor())).toEqual({ ok: true })
    await arcadeStartCinema.execute({}, {})

    // Every take used to open with a step that changed nothing.
    expect(stopSessionRecording()?.actions ?? []).toEqual([])
  })

  it('still opens a timeline that is closed', async () => {
    const ctx = createMockCommandContext()
    ctx.view = { ...viewMock(), showTimeline: () => false }
    setWebMcpContext(ctx)
    expect(startSessionRecording(ctx.flameDescriptor())).toEqual({ ok: true })
    await arcadeStartCinema.execute({}, {})

    expect(stopSessionRecording()?.actions.map((a) => a.id)).toEqual([
      'view.setShowTimeline',
    ])
  })
})

describe('Cinema tools', () => {
  afterEach(() => {
    resetPilot()
    cancelSessionRecording()
    clearWebMcpContext()
  })

  it('starts, lists paths, applies keyframes through timeline.loadTimeline, ends', async () => {
    const ctx = ctxWithRecorder()
    const brief = (await arcadeStartCinema.execute({}, {})) as Record<
      string,
      unknown
    >
    expect(brief).toMatchObject({ ok: true, stepBudget: 40 })
    // The brief names concrete command ids with their argument shapes, the
    // same as Teach, and still fits the tool-result budget.
    expect(JSON.stringify(brief)).toContain('timeline.setCurrentFrame')
    expect(JSON.stringify(brief).length).toBeLessThan(1500)
    expect(ctx.recorder!.start).toHaveBeenCalledTimes(1)
    const paths = (await arcadeGetAnimatablePaths.execute({}, {})) as {
      render: { path: string }[]
      transforms: { id: string }[]
    }
    expect(paths.render.map((p) => p.path)).toContain('exposure')
    expect(paths.transforms.map((t) => t.id)).toEqual(['t1', 't2'])
    expect(JSON.stringify(paths).length).toBeLessThan(2000)

    const result = await arcadeSetKeyframes.execute(
      {
        durationFrames: 90,
        tracks: [
          {
            path: 'camera.zoom',
            keyframes: [
              { frame: 0, value: 1 },
              { frame: 90, value: 1.8 },
            ],
          },
        ],
      },
      {},
    )
    expect(result).toMatchObject({
      ok: true,
      trackCount: 1,
      keyframeCount: 2,
      durationSeconds: 3,
    })
    expect(ctx.timeline.edit!.load).toHaveBeenCalledTimes(1)
    expect(ctx.timeline.play).toHaveBeenCalledTimes(1)
    expect(
      await arcadeSetKeyframes.execute(
        {
          durationFrames: 90,
          tracks: [{ path: 'bogus', keyframes: [{ frame: 0, value: 1 }] }],
        },
        {},
      ),
    ).toHaveProperty('error')

    const ended = await arcadeEndCinema.execute({ title: 'Slow push-in' }, {})
    expect(ended).toMatchObject({
      ok: true,
      sessionName: 'Animation: Slow push-in',
    })
    expect(pilot().phase).toBe('ended')
  })

  it('keeps the paths result inside the budget for a busy flame', async () => {
    const ctx = createMockCommandContext()
    const flame = createTestFlame()
    const template = (flame.transforms as unknown as Record<string, unknown>).t1
    const busy: Record<string, unknown> = {}
    for (let index = 1; index <= 8; index++) {
      const copy = JSON.parse(JSON.stringify(template)) as {
        variations: Record<string, unknown>
      }
      copy.variations = {
        [`v${index}a`]: { type: 'linearVar', weight: 1 },
        [`v${index}b`]: { type: 'sphericalVar', weight: 0.5 },
        [`v${index}c`]: { type: 'swirlVar', weight: 0.25 },
      }
      busy[`t${index}`] = copy
    }
    ;(flame as unknown as { transforms: unknown }).transforms = busy
    ctx.flameDescriptor = () => flame
    setWebMcpContext(ctx)

    const paths = (await arcadeGetAnimatablePaths.execute({}, {})) as {
      transforms: { id: string }[]
      transformPaths: string
    }
    expect(paths.transforms).toHaveLength(8)
    expect(paths.transformPaths).toContain('preAffine')
    // Was 1500 before blendWeight (the one keyable parameter no group named)
    // joined the result at 24 bytes. Every other addition here has to pay for
    // itself the same way: measure, then move this, rather than the reverse.
    expect(JSON.stringify(paths).length).toBeLessThan(1600)
  })

  /** The same flame opened from a motion row: the preset's own tracks are
   *  reported too, and that is the case an agent actually meets. */
  it('stays inside the budget when the flame arrives animated', async () => {
    const ctx = createMockCommandContext()
    ctx.timeline.tracks = () =>
      ['camera3D.theta', 'camera3D.phi', 'camera3D.radius'].map((path) => ({
        parameterPath: path,
        keyframes: [
          { frame: 0, value: 1 },
          { frame: 90, value: 2 },
        ],
      }))
    setWebMcpContext(ctx)
    const paths = await arcadeGetAnimatablePaths.execute({}, {})
    expect(JSON.stringify(paths).length).toBeLessThan(1900)
  })

  // The grammar is the agent's only description of what set_keyframes accepts,
  // so it must not name a form the catalog cannot produce. `buildAnimatableCatalog`
  // emits ONE entry per variation — its weight — and nothing keyed by parameter
  // name, so advertising `<id>.<variationId>.<param>` bought a guaranteed
  // "Unknown path" rejection and a wasted call.
  it('advertises only the variation form the catalog can produce', async () => {
    const ctx = ctxWithRecorder()
    setWebMcpContext(ctx)
    const paths = (await arcadeGetAnimatablePaths.execute({}, {})) as {
      transformPaths: string
    }
    expect(paths.transformPaths).toContain('<id>.<variationId>')
    expect(paths.transformPaths).toContain('weight')
    expect(paths.transformPaths).not.toContain('<param>')

    const catalog = buildAnimatableCatalog(ctx.flameDescriptor())
    const variationPaths = catalog
      .filter((entry) => entry.group.endsWith('variations'))
      .map((entry) => entry.path)
    expect(variationPaths.length).toBeGreaterThan(0)
    // Two segments each: the weight. A third would be a parameter, and there
    // are none.
    for (const path of variationPaths) {
      expect(path.split('.')).toHaveLength(2)
    }
  })

  it('keeps the wall-clock play out of the recorded take', async () => {
    const ctx = ctxWithRecorder()
    await arcadeStartCinema.execute({}, {})
    // A real recording, not the mock seam: this asserts what the recorder
    // itself sees. `timeline.play` is `recordable: false`, so an unsuppressed
    // dispatch would push an unnamed write and mark the session unfaithful.
    expect(startSessionRecording(ctx.flameDescriptor())).toEqual({ ok: true })
    const result = await arcadeSetKeyframes.execute(
      {
        durationFrames: 60,
        tracks: [
          {
            path: 'camera.zoom',
            keyframes: [
              { frame: 0, value: 1 },
              { frame: 60, value: 2 },
            ],
          },
        ],
      },
      {},
    )
    expect(result).toMatchObject({ ok: true, playing: true })
    expect(ctx.timeline.play).toHaveBeenCalledTimes(1)
    expect(unnamedWriteCount()).toBe(0)
    const ids = stopSessionRecording()?.actions.map((action) => action.id)
    expect(ids).toContain('timeline.loadTimeline')
    expect(ids).not.toContain('timeline.play')
  })

  it('refuses keyframes when no cinema session is active', async () => {
    setWebMcpContext(createMockCommandContext())
    expect(
      await arcadeSetKeyframes.execute({ durationFrames: 30, tracks: [] }, {}),
    ).toHaveProperty('error')
  })
})

/**
 * The listing an agent plans its whole take from.
 *
 * A 3D flame reported `camera: []` while `camera3D.theta` was keyable, moved
 * the picture, and was in the catalog the same call had just built — the
 * summary named the 2D group and nothing else, so a whole parameter family was
 * offered to nobody.
 */
describe('arcade_get_animatable_paths lists everything the timeline drives', () => {
  afterEach(() => {
    resetPilot()
    cancelSessionRecording()
    clearWebMcpContext()
  })

  type Summary = {
    render: { path: string }[]
    palette: { path: string }[]
    color: { path: string }[]
    camera: { path: string; current?: unknown }[]
    other: { path: string; current?: unknown }[]
    transformPaths: string
    existingTracks?: { count: number; endFrame: number; paths: string[] }
  }

  const summaryFor = async (flame: FlameDescriptor, ctxPatch = {}) => {
    const ctx = createMockCommandContext()
    ctx.flameDescriptor = () => flame
    Object.assign(ctx, ctxPatch)
    setWebMcpContext(ctx)
    return (await arcadeGetAnimatablePaths.execute({}, {})) as Summary
  }

  /**
   * Nothing the timeline can drive may be invisible to the agent: every
   * non-transform catalog path is either listed with its current value or
   * named by the `transformPaths` grammar. The bug was one whole group going
   * unnamed; this is the ratchet for the next one.
   */
  const assertCoversCatalog = (flame: FlameDescriptor, summary: Summary) => {
    const listed = new Set(
      [
        ...summary.render,
        ...summary.palette,
        ...summary.color,
        ...summary.camera,
        ...summary.other,
      ].map((entry) => entry.path),
    )
    // The grammar names the final transform's terms in its own layout: a-f,
    // or a-l for a 3D one.
    const namedByGrammar = (path: string) =>
      path.startsWith('finalTransform.') &&
      (summary.transformPaths.includes('finalTransform.{a-l}') ||
        (summary.transformPaths.includes('finalTransform.{a-f}') &&
          path.slice('finalTransform.'.length) <= 'f'))
    const missing = buildAnimatableCatalog(flame)
      .filter((entry) => !entry.group.startsWith('Transform '))
      .map((entry) => entry.path)
      .filter((path) => !listed.has(path) && !namedByGrammar(path))
    expect(missing).toEqual([])
  }

  it('offers the 3D camera family on a 3D flame', async () => {
    const flame = createTestFlame()
    flame.renderSettings.dimensions = 3
    flame.renderSettings.camera3D = {
      theta: 1.2,
      phi: 1.5,
      radius: 2.2,
      fov: 60,
    } as never
    const summary = await summaryFor(flame)
    expect(summary.camera.map((entry) => entry.path)).toEqual([
      'camera3D.theta',
      'camera3D.phi',
      'camera3D.radius',
      'camera3D.fov',
    ])
    expect(summary.camera[0]).toMatchObject({ current: 1.2 })
    assertCoversCatalog(flame, summary)
  })

  it('offers the 2D camera family on a 2D flame', async () => {
    const flame = createTestFlame()
    const summary = await summaryFor(flame)
    expect(summary.camera.map((entry) => entry.path)).toEqual([
      'camera.x',
      'camera.y',
      'camera.zoom',
      'camera.rotation',
    ])
    assertCoversCatalog(flame, summary)
  })

  it('names the tracks a preset arrived with', async () => {
    const ctx = createMockCommandContext()
    ctx.timeline.tracks = () =>
      [
        {
          parameterPath: 'camera3D.theta',
          keyframes: [
            { frame: 0, value: 1.2 },
            { frame: 90, value: 7.5 },
          ],
        },
      ] as never
    setWebMcpContext(ctx)
    const summary = (await arcadeGetAnimatablePaths.execute({}, {})) as Summary
    expect(summary.existingTracks).toMatchObject({
      count: 1,
      endFrame: 90,
      paths: ['camera3D.theta'],
    })
  })

  it('tells the pilot at the start what the timeline already holds', async () => {
    const ctx = ctxWithRecorder()
    ctx.timeline.tracks = () =>
      [
        {
          parameterPath: 'camera3D.theta',
          keyframes: [
            { frame: 0, value: 1.2 },
            { frame: 90, value: 7.5 },
          ],
        },
      ] as never
    const started = (await arcadeStartCinema.execute({}, {})) as {
      existingTracks?: { count: number; endFrame: number }
      tips: string[]
    }
    expect(started.existingTracks).toMatchObject({ count: 1, endFrame: 90 })
    expect(started.tips[0]).toContain('already holds 1 track(s)')
    expect(started.tips[0]).toContain('timeline.clearTracks')
  })

  it('says nothing about existing tracks when the timeline is empty', async () => {
    setWebMcpContext(createMockCommandContext())
    const summary = (await arcadeGetAnimatablePaths.execute({}, {})) as Summary
    expect(summary.existingTracks).toBeUndefined()
  })
})

/**
 * The paths result describes transform affines by a grammar, not per entry,
 * so the grammar has to name the layout each transform really has: a-f with
 * c and f the translation in 2D, a-l with d, h and l the translation in 3D.
 * A 3D flame can still hold 2D-layout affines (the 3D renderer maps them), so
 * a transform whose layout differs from the grammar's says so itself.
 */
describe('the paths result names each affine layout', () => {
  afterEach(() => {
    clearWebMcpContext()
  })

  const IDENTITY_3D = {
    a: 1,
    b: 0,
    c: 0,
    d: 0,
    e: 0,
    f: 1,
    g: 0,
    h: 0,
    i: 0,
    j: 0,
    k: 1,
    l: 0,
  }

  type AffineSummary = {
    transformPaths: string
    transforms: { id: string; affine?: string }[]
  }

  const summaryFor = async (flame: FlameDescriptor) => {
    const ctx = createMockCommandContext()
    ctx.flameDescriptor = () => flame
    setWebMcpContext(ctx)
    return (await arcadeGetAnimatablePaths.execute({}, {})) as AffineSummary
  }

  function flame3D(layoutOfT2: '2D' | '3D' = '3D') {
    const flame = createTestFlame()
    flame.renderSettings.dimensions = 3
    const transforms = flame.transforms as unknown as Record<
      string,
      { preAffine: unknown; postAffine: unknown }
    >
    for (const [id, t] of Object.entries(transforms)) {
      if (id === 't2' && layoutOfT2 === '2D') continue
      t.preAffine = { ...IDENTITY_3D }
      t.postAffine = { ...IDENTITY_3D }
    }
    return flame
  }

  it('a 2D flame: a-f, and which of them is the translation', async () => {
    const summary = await summaryFor(createTestFlame())
    expect(summary.transformPaths).toContain("{a-f}: x'=ax+by+c, y'=dx+ey+f")
    expect(summary.transformPaths).toContain('finalTransform.{a-f}')
    expect(summary.transforms.map((t) => t.affine)).toEqual([
      undefined,
      undefined,
    ])
  })

  it('a 3D flame: a-l, and which of them is the translation', async () => {
    const summary = await summaryFor(flame3D())
    expect(summary.transformPaths).toContain(
      "{a-l}: x'=ax+by+cz+d, y'=ex+fy+gz+h, z'=ix+jy+kz+l",
    )
    expect(summary.transformPaths).toContain('finalTransform.{a-l}')
    expect(summary.transformPaths).not.toContain('{a-f}')
  })

  it('a 3D flame holding a 2D-layout affine names both, and marks that transform', async () => {
    const summary = await summaryFor(flame3D('2D'))
    expect(summary.transformPaths).toContain('{a-l}')
    expect(summary.transformPaths).toContain('{a-f}')
    expect(summary.transforms).toEqual([
      expect.objectContaining({ id: 't1', affine: undefined }),
      expect.objectContaining({ id: 't2', affine: '2D' }),
    ])
  })

  it('a 3D flame with a 2D-layout final transform describes the final in its own terms', async () => {
    const flame = flame3D()
    flame.finalTransform = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
    const summary = await summaryFor(flame)
    expect(summary.transformPaths).toContain('finalTransform.{a-f}')
    expect(summary.transformPaths).toContain("{a-f}: x'=ax+by+c, y'=dx+ey+f")
  })

  it('a 2D flame switched to 3D: its affines are all 2D-layout, the final the timeline creates is 3D', async () => {
    const flame = createTestFlame()
    flame.renderSettings.dimensions = 3
    const summary = await summaryFor(flame)
    expect(summary.transformPaths).toContain(
      "preAffine|postAffine}.{a-f}: x'=ax+by+c, y'=dx+ey+f",
    )
    expect(summary.transformPaths).toContain(
      "finalTransform.{a-l}: x'=ax+by+cz+d",
    )
    // Every transform is in the layout the grammar gives first: no notes.
    expect(summary.transforms.map((t) => t.affine)).toEqual([
      undefined,
      undefined,
    ])
  })

  const IDENTITY_2D = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }

  /** Eight transforms of three variations each, their affines in the given
   *  layouts: `layouts(index)` gives transform `index`'s pre and post. */
  function busyFlame(
    dims: 2 | 3,
    layouts: (index: number) => ['2D' | '3D', '2D' | '3D'],
  ) {
    const flame = createTestFlame()
    flame.renderSettings.dimensions = dims
    const template = (flame.transforms as unknown as Record<string, unknown>).t1
    const identity = { '2D': IDENTITY_2D, '3D': IDENTITY_3D }
    const transforms: Record<string, unknown> = {}
    for (let index = 1; index <= 8; index++) {
      const [pre, post] = layouts(index)
      transforms[`t${index}`] = {
        ...(JSON.parse(JSON.stringify(template)) as object),
        preAffine: { ...identity[pre] },
        postAffine: { ...identity[post] },
        variations: {
          [`v${index}a`]: { type: 'linear3D', weight: 1 },
          [`v${index}b`]: { type: 'spherical3D', weight: 0.5 },
          [`v${index}c`]: { type: 'swirl3D', weight: 0.25 },
        },
      }
    }
    ;(flame as unknown as { transforms: unknown }).transforms = transforms
    return flame
  }

  const sizeOf = async (flame: FlameDescriptor, animated: boolean) => {
    const ctx = createMockCommandContext()
    ctx.flameDescriptor = () => flame
    if (animated) {
      ctx.timeline.tracks = () =>
        ['camera3D.theta', 'camera3D.phi', 'camera3D.radius'].map((path) => ({
          parameterPath: path,
          keyframes: [
            { frame: 0, value: 1 },
            { frame: 90, value: 2 },
          ],
        }))
    }
    setWebMcpContext(ctx)
    return JSON.stringify(await arcadeGetAnimatablePaths.execute({}, {})).length
  }

  // The same budgets as a busy 2D flame (1600, and 1900 when it arrives
  // animated): the grammar is given in the layout most affines are in, so a
  // flame whose affines share one layout pays nothing for it, whatever its
  // dimensions.
  const ONE_LAYOUT: [string, FlameDescriptor][] = [
    ['2D flame', busyFlame(2, () => ['2D', '2D'])],
    ['3D flame, 3D-layout affines', busyFlame(3, () => ['3D', '3D'])],
    ['2D flame switched to 3D', busyFlame(3, () => ['2D', '2D'])],
    ['3D flame switched to 2D', busyFlame(2, () => ['3D', '3D'])],
  ]
  for (const [name, flame] of ONE_LAYOUT) {
    it(`${name}: inside the budget of a busy 2D flame`, async () => {
      expect(await sizeOf(flame, false)).toBeLessThan(1600)
      expect(await sizeOf(flame, true)).toBeLessThan(1900)
    })
  }

  // A 3D flame holding both layouts has to name both: the second equation
  // (67 chars) and a note on each listed transform in the other layout (at
  // most 24 chars, "preAffine 2D", times 8). On top of the one-layout budget
  // that is at most 1600 + 67 + 192 = 1859, so 1900; animated, 2150. Measured:
  // 1823 / 2059 for every transform mixed, 1687 / 1923 for half, 1645 / 1881
  // for one.
  const TWO_LAYOUTS: [string, FlameDescriptor][] = [
    [
      'every transform pre 2D-layout, post 3D',
      busyFlame(3, () => ['2D', '3D']),
    ],
    [
      'half the transforms 2D-layout',
      busyFlame(3, (i) => (i <= 4 ? ['2D', '2D'] : ['3D', '3D'])),
    ],
    [
      'one transform 2D-layout',
      busyFlame(3, (i) => (i === 1 ? ['2D', '2D'] : ['3D', '3D'])),
    ],
  ]
  for (const [name, flame] of TWO_LAYOUTS) {
    it(`3D flame, ${name}: pays only for the second layout`, async () => {
      expect(await sizeOf(flame, false)).toBeLessThan(1900)
      expect(await sizeOf(flame, true)).toBeLessThan(2150)
    })
  }
})
