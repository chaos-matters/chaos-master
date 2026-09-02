import '@/commands/builtins'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pilot, resetPilot } from '@/arcade/pilot'
import { cancelSessionRecording } from '@/recorder/recorder'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext } from '@/webmcp/testUtils'
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

describe('Cinema tools', () => {
  afterEach(() => {
    resetPilot()
    cancelSessionRecording()
    clearWebMcpContext()
  })

  it('starts, lists paths, applies keyframes through timeline.loadTimeline, ends', async () => {
    const ctx = ctxWithRecorder()
    expect(await arcadeStartCinema.execute({}, {})).toMatchObject({
      ok: true,
      stepBudget: 40,
    })
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

  it('refuses keyframes when no cinema session is active', async () => {
    setWebMcpContext(createMockCommandContext())
    expect(
      await arcadeSetKeyframes.execute({ durationFrames: 30, tracks: [] }, {}),
    ).toHaveProperty('error')
  })
})
