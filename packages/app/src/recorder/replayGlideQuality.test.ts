import '@/commands/builtins'
import { createRoot, createSignal } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeCommand, executeReplayCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { planGlide } from '@/flame/glide/plan'
import { GLIDE_QUALITY_TIERS, resolveGlideQuality } from '@/flame/glide/quality'
import { createGlideRuntime, glideQualityPreference, restoreGlideSwitches, setGlideQualityPreference, } from '@/flame/glide/runtime'
import { deepClone } from '@/utils/clone'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { createSessionPlayer } from './player'
import { createReplayVideoDriver, createReplayVideoJobSpec, createReplayVideoSchedule, replayFrameQuality, replayStateAtFrame, } from './replayVideo'
import { SESSION_FORMAT_VERSION } from './schema'
import type { ReplayGlideOptions } from './glide'
import type { ReplayTarget } from './replay'
import type { RecordedSession } from './schema'
import type { GlidePlan, GlideQualityTier } from '@/flame/glide/types'

/**
 * A take can switch Glide quality as it goes (`glide.setQuality`, and under
 * `auto` the quality preset). The live replay's glides follow those steps, so
 * the artwork export of the same take has to: a glide into step N takes the
 * length, and renders at the quality, of the tier in force once step N ran.
 */

// Every plan either replay makes, with the real planner behind it.
vi.mock('@/flame/glide/plan', async (importOriginal) => {
  const actual: { planGlide: typeof planGlide } = await importOriginal()
  return { ...actual, planGlide: vi.fn(actual.planGlide) }
})
const plansMade = () => {
  const plans = vi
    .mocked(planGlide)
    .mock.results.map((result) => result.value as GlidePlan)
  vi.mocked(planGlide).mockClear()
  return plans.map(({ durationMs, frames, fps, quality }) => ({
    durationMs,
    frames,
    fps,
    quality,
  }))
}

/** Two seconds apart, so no glide is ever cut short by the run it is in. */
const take: RecordedSession = {
  version: SESSION_FORMAT_VERSION,
  app: { version: 'test', flameSchemaVersion: '1.0' },
  createdAt: new Date(0).toISOString(),
  initial: deepClone(examples.example1),
  initialView: {
    qualityPreset: 'ultra',
    adaptiveFilter: true,
    stochasticFilter: false,
    flyMode: false,
    showTimeline: false,
    sidebarOpen: true,
  },
  actions: [
    { t: 0, id: 'flame.setGamma', args: [2] },
    { t: 2000, id: 'view.setQualityPreset', args: ['high'] },
    { t: 4000, id: 'flame.setGamma', args: [3] },
    { t: 6000, id: 'glide.setQuality', args: ['responsive'] },
    // The live replay's glides follow its own toggle, not this switch.
    { t: 8000, id: 'glide.setEnabled', args: [false] },
    { t: 10_000, id: 'flame.setGamma', args: [4] },
    { t: 12_000, id: 'glide.setQuality', args: ['auto'] },
    { t: 14_000, id: 'flame.setGamma', args: [5] },
  ],
  unnamedWriteCount: 0,
}

/** The tier each step's glide takes, once it ran: the take's preset is
 *  `ultra` (full), then `high` (balanced) under the viewer's `auto`. */
const TIERS: GlideQualityTier[] = [
  'full',
  'balanced',
  'balanced',
  'responsive',
  'responsive',
  'responsive',
  'balanced',
  'balanced',
]
const GLIDE_MS = TIERS.map(
  (tier) => 600 * GLIDE_QUALITY_TIERS[tier].durationScale,
)

/** The viewer: `auto` on a `low` preset, glides on in the replay panel. */
const VIEWER_PRESET = 'low'

/** What the replay panel sends with an artwork export, pressed now. */
function exportRequest(): ReplayGlideOptions {
  const quality = resolveGlideQuality(glideQualityPreference(), VIEWER_PRESET)
  return {
    enabled: true,
    preference: glideQualityPreference(),
    tier: quality.tier,
    durationScale: quality.durationScale,
  }
}

/** Replay the take live at 1x; when each step ran, and each glide into it.
 *  `flip`: the viewer's own live `glide.setQuality`, that many ms in. */
function replayLive(flip?: [number, string]) {
  return createRoot((dispose) => {
    const [preset, setPreset] = createSignal(VIEWER_PRESET)
    const ctx = createMockCommandContext()
    const none = () => {}
    ctx.view = {
      setQualityPreset: setPreset,
      setAdaptiveFilter: none,
      setStochasticFilter: none,
      setFlyMode: none,
      setShowTimeline: none,
    }
    const quality = () =>
      resolveGlideQuality(glideQualityPreference(), preset())
    // The workspace's runtime, which plans each glide the replay starts.
    const runtime = createGlideRuntime({
      readFlame: () => ctx.flameDescriptor(),
      writeFlame: () => {},
      qualityPreset: preset,
      requestFrame: () => 0,
      cancelFrame: () => {},
    })
    const ranAt: number[] = []
    const glides: { ms: number; tier: GlideQualityTier }[] = []
    const started = Date.now()
    let takeOver: (() => void) | undefined
    const target: ReplayTarget = {
      beginBatch: (onTakeover) => (takeOver = onTakeover),
      endBatch: () => (takeOver = undefined),
      loadInitial: () => {},
      loadView: (view) => setPreset(view.qualityPreset),
      readFlame: () => deepClone(examples.example1),
      glide: (from, ms) => {
        glides.push({ ms, tier: quality().tier })
        void runtime.glideFrom(from, { durationMs: ms })
      },
      execute: (id, args) => {
        ranAt.push(Date.now() - started)
        return executeReplayCommand(id, ctx, ...args)
      },
    }
    // The panel's options: its own toggle, the workspace's tier right now.
    const player = createSessionPlayer(take, target, {
      glide: () => ({
        enabled: true,
        durationScale: quality().durationScale,
        tier: quality().tier,
      }),
    })
    player.play()
    if (flip) {
      vi.advanceTimersByTime(flip[0])
      const live = { ...ctx, beforeCommand: () => takeOver?.() }
      executeCommand('glide.setQuality', live, flip[1])
    }
    vi.runAllTimers()
    dispose()
    return { ranAt, glides }
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  restoreGlideSwitches({ enabled: false, quality: 'auto' })
})
afterEach(() => {
  vi.useRealTimers()
  restoreGlideSwitches({ enabled: false, quality: 'auto' })
})

describe("the artwork export follows the take's Glide quality", () => {
  it('glides into each step at the tier in force once it ran, live', () => {
    const live = replayLive()

    expect(live.glides.map((glide) => glide.tier)).toEqual(TIERS)
    expect(live.glides.map((glide) => glide.ms)).toEqual(GLIDE_MS)
  })

  it('glides the next step at a tier the viewer flips while it plays', () => {
    // Flipped between the first step and the second, which switches no tier:
    // the take's own glide.setQuality steps still win from where they run.
    const live = replayLive([1000, 'responsive'])

    expect(live.ranAt).toHaveLength(take.actions.length)
    expect(live.glides.map((glide) => glide.tier)).toEqual([
      'full',
      ...TIERS.slice(1, 6).map(() => 'responsive'),
      'balanced',
      'balanced',
    ])
  })

  it('gives the same glide lengths and step times as the live replay', () => {
    const request = exportRequest()
    const live = replayLive()
    // A frame a millisecond, from zero: frames are the live clock exactly.
    const schedule = createReplayVideoSchedule(take, 1, 1000, 0, 1400, request)

    expect(schedule.glideFrames).toEqual(live.glides.map((glide) => glide.ms))
    expect(schedule.actionTimesMs).toEqual(live.ranAt)
    expect(schedule.glideTiers).toEqual(TIERS)
  })

  it('plans each glide with the inputs the live replay plans it with', () => {
    plansMade()
    replayLive()
    const live = plansMade()
    const schedule = createReplayVideoSchedule(
      take,
      1,
      24,
      650,
      1400,
      exportRequest(),
    )
    const driver = createReplayVideoDriver(take, schedule)
    take.actions.forEach((_, index) => driver.advanceTo(index, 0.5))

    expect(live).toHaveLength(take.actions.length)
    expect(plansMade()).toEqual(live)
  })

  it("renders each glide frame at its step's tier and each settle at full", () => {
    const quality = 0.9
    const schedule = createReplayVideoSchedule(
      take,
      1,
      24,
      650,
      1400,
      exportRequest(),
    )
    for (let index = 0; index < take.actions.length; index++) {
      const frame = schedule.actionFrames[index]!
      const scale = GLIDE_QUALITY_TIERS[TIERS[index]!].accumulationScale
      const gliding = replayStateAtFrame(schedule, frame)
      const settled = replayStateAtFrame(
        schedule,
        frame + schedule.glideFrames[index]!,
      )
      expect(gliding.glideT).toBeLessThan(1)
      expect(replayFrameQuality(schedule, gliding, quality)).toBeCloseTo(
        quality * scale,
      )
      expect(replayFrameQuality(schedule, settled, quality)).toBe(quality)
    }
  })

  it('makes two exports of one take identical, whatever the switches do after', () => {
    const request = exportRequest()
    const first = createReplayVideoJobSpec(take, 1, request)
    setGlideQualityPreference('full')
    const second = createReplayVideoJobSpec(take, 1, request)

    expect(second).toEqual(first)
    const schedule = (job: typeof first) =>
      createReplayVideoSchedule(
        job.session!,
        job.replayVideo!.playbackSpeed,
        job.fps,
        job.replayVideo!.leadInMs,
        job.replayVideo!.tailMs,
        job.replayVideo!.glide,
      )
    expect(schedule(second)).toEqual(schedule(first))
  })
})
