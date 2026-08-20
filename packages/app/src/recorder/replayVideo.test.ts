import { describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { createReplayVideoDriver, createReplayVideoJobSpec, createReplayVideoSchedule, drawReplayVideoOverlay, MAX_REPLAY_VIDEO_DURATION_MS, REPLAY_VIDEO_FPS, REPLAY_VIDEO_SIZE, replayActionIndexAtFrame, replayFramesInStateRun, replayVideoFileName, replayVideoVisualFingerprint, } from './replayVideo'
import { SESSION_FORMAT_VERSION } from './schema'
import type { RecordedAction, RecordedSession } from './schema'

function makeSession(actions: RecordedAction[]): RecordedSession {
  return {
    version: SESSION_FORMAT_VERSION,
    app: { version: 'test', flameSchemaVersion: '1.0' },
    createdAt: new Date(0).toISOString(),
    initial: deepClone(examples.example1),
    actions,
    unnamedWriteCount: 0,
  }
}

describe('replay video timing', () => {
  it('matches replay timestamp clamping, authored holds, and speed', () => {
    const session = makeSession([
      { t: 200, id: 'flame.setGamma', args: [1.5] },
      { t: 1600, id: 'flame.setGamma', args: [2], holdMs: 800 },
      { t: 1800, id: 'flame.setGamma', args: [2.5] },
    ])
    const schedule = createReplayVideoSchedule(session, 2, 10, 600, 1000)

    expect(schedule.actionTimesMs).toEqual([700, 1400, 1800])
    expect(schedule.durationMs).toBe(2800)
    expect(schedule.totalFrames).toBe(28)
    expect(replayActionIndexAtFrame(schedule, 6)).toBe(-1)
    expect(replayActionIndexAtFrame(schedule, 7)).toBe(0)
    expect(replayActionIndexAtFrame(schedule, 13)).toBe(0)
    expect(replayActionIndexAtFrame(schedule, 14)).toBe(1)
    expect(replayActionIndexAtFrame(schedule, 18)).toBe(2)
    expect(replayFramesInStateRun(schedule, 7)).toBe(7)
  })

  it('refuses pathological videos before allocating an encoder', () => {
    const session = makeSession([
      {
        t: 0,
        id: 'flame.setGamma',
        args: [1.5],
        holdMs: MAX_REPLAY_VIDEO_DURATION_MS,
      },
      { t: 1, id: 'flame.setGamma', args: [2] },
    ])

    expect(() => createReplayVideoSchedule(session)).toThrow(
      /Shorten long holds or choose a faster replay speed/,
    )
  })

  it('gives simultaneous authored actions distinct video frames', () => {
    const session = makeSession([
      { t: 0, id: 'flame.setGamma', args: [1.5] },
      { t: 0, id: 'flame.setContrast', args: [1.2] },
      { t: 0, id: 'flame.setVibrancy', args: [0.8] },
    ])
    const schedule = createReplayVideoSchedule(session, 1, 10, 100, 100)

    expect(schedule.actionFrames).toEqual([1, 2, 3])
    expect(replayActionIndexAtFrame(schedule, 1)).toBe(0)
    expect(replayActionIndexAtFrame(schedule, 2)).toBe(1)
    expect(replayActionIndexAtFrame(schedule, 3)).toBe(2)
  })

  it('keeps the final step when an internal caller requests no tail', () => {
    const schedule = createReplayVideoSchedule(
      makeSession([{ t: 0, id: 'flame.setGamma', args: [1.5] }]),
      1,
      24,
      0,
      0,
    )

    expect(schedule.actionFrames).toEqual([0])
    expect(schedule.totalFrames).toBe(1)
    expect(replayActionIndexAtFrame(schedule, 0)).toBe(0)
  })
})

describe('createReplayVideoDriver', () => {
  it('replays registered commands in an isolated world without mutating input', () => {
    const session = makeSession([
      {
        t: 0,
        id: 'flame.setGamma',
        args: [1.7],
        label: 'Lower gamma',
      },
      { t: 100, id: 'view.setAdaptiveFilter', args: [false] },
      { t: 200, id: 'camera.center', args: [] },
    ])
    session.initial.renderSettings.camera.position = [3, -2]
    session.initial.renderSettings.camera.zoom = 4
    const untouched = deepClone(session)
    const driver = createReplayVideoDriver(session)

    expect(driver.reset().actionIndex).toBe(-1)
    const first = driver.advanceTo(0)
    expect(first.flame.renderSettings.gamma).toBe(1.7)
    expect(first.action?.label).toBe('Lower gamma')

    const final = driver.advanceTo(2)
    expect(final.adaptiveFilter).toBe(false)
    expect(final.flame.renderSettings.camera.position).toEqual([0, 0])
    expect(final.flame.renderSettings.camera.zoom).toBe(1)
    expect(session).toEqual(untouched)
  })

  it('preserves timeline write-through and renders the held frame', () => {
    const session = makeSession([
      {
        t: 0,
        id: 'timeline.addKeyframe',
        args: ['gamma', 1.25, 5, null, null],
      },
      {
        t: 100,
        id: 'timeline.setKeyframeValue',
        args: ['gamma', 5, 2.75, null, null],
      },
    ])
    session.initialTimeline = {
      config: {
        fps: 30,
        timeScale: 1,
        startFrame: 0,
        endFrame: 20,
        loop: false,
      },
      currentFrame: 5,
      animationEnabled: true,
      autoKeyframe: true,
      previewHeld: true,
      tracks: [],
    }

    const driver = createReplayVideoDriver(session)
    expect(driver.advanceTo(0).flame.renderSettings.gamma).toBe(1.25)
    expect(driver.advanceTo(1).flame.renderSettings.gamma).toBe(2.75)
    expect(driver.advanceTo(-1).flame.renderSettings.gamma).toBe(
      session.initial.renderSettings.gamma,
    )
  })

  it('rejects an imported action before touching replay state', () => {
    const session = makeSession([
      { t: 0, id: 'definitely.not-a-command', args: [] },
    ])
    expect(() => createReplayVideoDriver(session)).toThrow(
      /Unknown replay command/,
    )
  })

  it('distinguishes visual steps from captions that can reuse artwork', () => {
    const driver = createReplayVideoDriver(
      makeSession([
        {
          t: 0,
          id: 'flame.setMetadata',
          args: ['name', 'Published study'],
        },
        { t: 100, id: 'flame.setGamma', args: [1.9] },
      ]),
    )

    const baseline = replayVideoVisualFingerprint(driver.reset())
    const metadata = replayVideoVisualFingerprint(driver.advanceTo(0))
    const gamma = replayVideoVisualFingerprint(driver.advanceTo(1))

    expect(metadata).toBe(baseline)
    expect(gamma).not.toBe(baseline)
  })
})

describe('createReplayVideoJobSpec', () => {
  it('builds a detached square MP4 job from the edited take', () => {
    const session = makeSession([
      {
        t: 250,
        id: 'flame.setGamma',
        args: [1.8],
        note: 'Bring out the glow',
      },
    ])
    session.initial.metadata = {
      ...session.initial.metadata,
      name: 'Aurora / Study',
    }

    const job = createReplayVideoJobSpec(session, 2)

    expect(job.name).toBe('Aurora-Study-creation-replay')
    expect(replayVideoFileName(session, 'interface')).toBe(
      'Aurora-Study-interface-replay',
    )
    expect(job.dimensions).toEqual({
      width: REPLAY_VIDEO_SIZE,
      height: REPLAY_VIDEO_SIZE,
    })
    expect(job.fps).toBe(REPLAY_VIDEO_FPS)
    expect(job.codec).toBe('avc')
    expect(job.embedMetadata).toBe(true)
    expect(job.replayVideo?.playbackSpeed).toBe(2)
    expect(job.frameEnd).toBeGreaterThan(job.frameStart)
    expect(job.session).toEqual(session)

    session.actions[0]!.note = 'Changed after enqueue'
    expect(job.session?.actions[0]?.note).toBe('Bring out the glow')
  })

  it('refuses to publish a take with uncaptured edits', () => {
    const session = makeSession([])
    session.unnamedWriteCount = 2

    expect(() => createReplayVideoJobSpec(session)).toThrow(
      /2 uncaptured edits/,
    )
  })

  it('refuses custom variation code that the portable session cannot package', () => {
    const session = makeSession([{ t: 0, id: 'flame.setGamma', args: [1.5] }])
    const firstTransform = Object.values(session.initial.transforms)[0]!
    const firstVariation = Object.values(firstTransform.variations)[0]!
    firstVariation.type = 'custom_local_only'

    expect(() => createReplayVideoJobSpec(session)).toThrow(
      /cannot yet package custom variation code used by the recording baseline/,
    )
  })

  it('checks custom variations introduced by a later whole-flame step', () => {
    const loaded = deepClone(examples.example1)
    const firstTransform = Object.values(loaded.transforms)[0]!
    const firstVariation = Object.values(firstTransform.variations)[0]!
    firstVariation.type = 'custom_later_step'
    const session = makeSession([
      { t: 0, id: 'flame.load', args: [loaded, 'Load custom flame'] },
    ])

    expect(() => createReplayVideoJobSpec(session)).toThrow(
      /cannot yet package custom variation code used by the step 1/,
    )
  })

  it('checks custom variation ids carried by semantic add steps', () => {
    const transformId = Object.keys(examples.example1.transforms)[0]!
    const session = makeSession([
      {
        t: 0,
        id: 'flame.addVariation',
        args: [transformId, 'custom_local_only', 'variation-added'],
      },
    ])

    expect(() => createReplayVideoJobSpec(session)).toThrow(
      /cannot yet package custom variation code used by the step 1/,
    )
  })

  it('refuses an empty take that has no creation sequence to publish', () => {
    expect(() => createReplayVideoJobSpec(makeSession([]))).toThrow(
      /no authored steps/,
    )
  })
})

describe('drawReplayVideoOverlay', () => {
  it('keeps an unbroken authored caption inside the output safe width', () => {
    const drawn: string[] = []
    const context = {
      save: () => {},
      restore: () => {},
      measureText: (text: string) => ({ width: text.length * 10 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      fillText: (text: string) => drawn.push(text),
      fillRect: () => {},
      clearRect: () => {},
    } as unknown as CanvasRenderingContext2D

    drawReplayVideoOverlay(context, 200, 200, {
      action: {
        t: 0,
        id: 'flame.setGamma',
        args: [1.5],
        note: 'x'.repeat(200),
      },
      actionIndex: 0,
      totalActions: 1,
      progress: 0.5,
    })

    const caption = drawn.find((text) => text.startsWith('x'))
    expect(caption).toBeDefined()
    expect(caption?.endsWith('…')).toBe(true)
    expect((caption?.length ?? 0) * 10).toBeLessThanOrEqual(182)
  })
})
