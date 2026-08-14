import '@/commands/builtins'
import { describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { isTimelineParameterPath, MAX_TIMELINE_FRAME, MAX_TIMELINE_KEYFRAMES, MAX_TIMELINE_PARAMETER_PATH_LENGTH, MAX_TIMELINE_PLAYBACK_FPS, MAX_TIMELINE_TIME_SCALE, tryValidateTimelineSnapshot, } from '@/flame/schema/timeline'
import { getAllCommands, hasExplicitReplayPolicy, preflightReplayCommand, registerCommand, } from './registry'

function timelineSnapshot(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    config: {
      fps: 30,
      timeScale: 1,
      startFrame: 0,
      endFrame: 90,
      loop: true,
    },
    currentFrame: 0,
    tracks: [],
    ...overrides,
  }
}

describe('replay command policy', () => {
  it('has an explicit policy for every registered command', () => {
    const missing = getAllCommands()
      .filter((command) => !hasExplicitReplayPolicy(command))
      .map((command) => command.id)
    expect(missing).toEqual([])
  })

  it('rejects malformed known commands instead of falling back at execute', () => {
    expect(preflightReplayCommand('flame.setGamma', ['x'])).toBeDefined()
    expect(preflightReplayCommand('flame.setGamma', [2.2, 3])).toBeDefined()
    expect(preflightReplayCommand('flame.setGamma', [2.2])).toBeUndefined()
    expect(preflightReplayCommand('future.command', [])).toBeDefined()
  })

  it('denies a newly registered command until it opts into replay', () => {
    const command = {
      id: 'test.command-without-replay-policy',
      label: 'Test Command',
      description: 'Test-only registry entry',
      execute: () => undefined,
    }
    registerCommand(command)
    expect(preflightReplayCommand(command.id, [])).toContain(
      'no explicit replay policy',
    )
    // Leave the module-global test entry explicitly blocked so later ratchets
    // in this worker still describe the production invariant correctly.
    Object.assign(command, { replayable: false })
  })

  it('keeps non-serializable transport and private history commands blocked', () => {
    expect(preflightReplayCommand('timeline.play', [])).toBeDefined()
    expect(preflightReplayCommand('history.undo', [])).toBeDefined()
    expect(preflightReplayCommand('history.redo', [])).toBeDefined()
  })

  it('bounds every scalar timeline command before execution', () => {
    expect(
      preflightReplayCommand('timeline.setDuration', [MAX_TIMELINE_FRAME]),
    ).toBeUndefined()
    expect(
      preflightReplayCommand('timeline.setDuration', [MAX_TIMELINE_FRAME + 1]),
    ).toBeDefined()
    expect(
      preflightReplayCommand('timeline.setDuration', [1e308]),
    ).toBeDefined()
    expect(
      preflightReplayCommand('timeline.setFps', [MAX_TIMELINE_PLAYBACK_FPS]),
    ).toBeUndefined()
    expect(
      preflightReplayCommand('timeline.setFps', [
        MAX_TIMELINE_PLAYBACK_FPS + 1,
      ]),
    ).toBeDefined()
    expect(
      preflightReplayCommand('timeline.setCurrentFrame', [MAX_TIMELINE_FRAME]),
    ).toBeUndefined()
    expect(
      preflightReplayCommand('timeline.setCurrentFrame', [
        MAX_TIMELINE_FRAME + 1,
      ]),
    ).toBeDefined()
  })

  it('accepts only bounded safe keyframe paths, frames, and values', () => {
    const path = 'transform._t__one.preAffine.a'
    expect(
      preflightReplayCommand('timeline.addKeyframe', [
        path,
        [0, 0.5, 1, 1],
        MAX_TIMELINE_FRAME,
        'easeInOut',
      ]),
    ).toBeUndefined()
    expect(
      preflightReplayCommand('timeline.addKeyframe', [
        'transform.__proto__.probability',
        1,
        0,
      ]),
    ).toBeDefined()
    expect(
      preflightReplayCommand('timeline.addKeyframe', [path, 1, 1e308]),
    ).toBeDefined()
    expect(
      preflightReplayCommand('timeline.addKeyframe', [
        path,
        [0, 1, 2, 3, 4],
        0,
      ]),
    ).toBeDefined()
  })
})

describe('timeline snapshot budgets', () => {
  it('accepts exact frame, speed, and path boundaries', () => {
    const path = 'p'.repeat(MAX_TIMELINE_PARAMETER_PATH_LENGTH)
    const snapshot = timelineSnapshot({
      config: {
        fps: MAX_TIMELINE_PLAYBACK_FPS,
        timeScale: MAX_TIMELINE_TIME_SCALE,
        startFrame: 0,
        endFrame: MAX_TIMELINE_FRAME,
        loop: false,
      },
      currentFrame: MAX_TIMELINE_FRAME,
      tracks: [
        {
          parameterPath: path,
          keyframes: [{ frame: MAX_TIMELINE_FRAME, value: 1 }],
        },
      ],
    })
    expect(isTimelineParameterPath(path)).toBe(true)
    expect(tryValidateTimelineSnapshot(snapshot)).toBeDefined()
  })

  it('rejects one beyond every timeline scalar boundary', () => {
    const baseConfig = {
      fps: 30,
      timeScale: 1,
      startFrame: 0,
      endFrame: 90,
      loop: true,
    }
    expect(
      tryValidateTimelineSnapshot(
        timelineSnapshot({
          config: { ...baseConfig, endFrame: MAX_TIMELINE_FRAME + 1 },
        }),
      ),
    ).toBeUndefined()
    expect(
      tryValidateTimelineSnapshot(
        timelineSnapshot({
          config: {
            ...baseConfig,
            timeScale: MAX_TIMELINE_TIME_SCALE + 0.01,
          },
        }),
      ),
    ).toBeUndefined()
    expect(
      tryValidateTimelineSnapshot(
        timelineSnapshot({ currentFrame: MAX_TIMELINE_FRAME + 1 }),
      ),
    ).toBeUndefined()
    expect(
      isTimelineParameterPath(
        'p'.repeat(MAX_TIMELINE_PARAMETER_PATH_LENGTH + 1),
      ),
    ).toBe(false)
  })

  it('caps the aggregate keyframe count in the low thousands', () => {
    const firstCount = Math.floor(MAX_TIMELINE_KEYFRAMES / 2)
    const track = (parameterPath: string, count: number) => ({
      parameterPath,
      keyframes: Array.from({ length: count }, (_, frame) => ({
        frame: frame % (MAX_TIMELINE_FRAME + 1),
        value: 1,
      })),
    })
    const atLimit = timelineSnapshot({
      tracks: [
        track('exposure', firstCount),
        track('gamma', MAX_TIMELINE_KEYFRAMES - firstCount),
      ],
    })
    const overLimit = timelineSnapshot({
      tracks: [
        track('exposure', firstCount),
        track('gamma', MAX_TIMELINE_KEYFRAMES - firstCount + 1),
      ],
    })
    expect(tryValidateTimelineSnapshot(atLimit)).toBeDefined()
    expect(tryValidateTimelineSnapshot(overLimit)).toBeUndefined()
  })

  it('applies the same timeline budgets to recorded workspace restores', () => {
    const overLimit = timelineSnapshot({
      tracks: [
        {
          parameterPath: 'exposure',
          keyframes: Array.from(
            { length: MAX_TIMELINE_KEYFRAMES + 1 },
            (_, frame) => ({ frame: frame % 91, value: 1 }),
          ),
        },
      ],
    })
    const unsafePath = timelineSnapshot({
      tracks: [
        {
          parameterPath: 'transform.__proto__.probability',
          keyframes: [{ frame: 0, value: 1 }],
        },
      ],
    })

    expect(
      preflightReplayCommand('recorder.restoreWorkspaceSnapshot', [
        examples.example1,
        overLimit,
      ]),
    ).toBeDefined()
    expect(
      preflightReplayCommand('recorder.restoreWorkspaceSnapshot', [
        examples.example1,
        unsafePath,
      ]),
    ).toBeDefined()
  })
})
