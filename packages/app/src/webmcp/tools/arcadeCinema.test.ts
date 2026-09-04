import '@/commands/builtins'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAnimatableCatalog } from '@/arcade/animatablePaths'
import { pilot, resetPilot } from '@/arcade/pilot'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, unnamedWriteCount, } from '@/recorder/recorder'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { arcadeEndCinema, arcadeGetAnimatablePaths, arcadeSetKeyframes, arcadeStartCinema, } from './arcadeCinema'

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
        [`v${index}a`]: { type: 'linear', weight: 1 },
        [`v${index}b`]: { type: 'spherical', weight: 0.5 },
        [`v${index}c`]: { type: 'swirl', weight: 0.25 },
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
    expect(JSON.stringify(paths).length).toBeLessThan(1500)
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
