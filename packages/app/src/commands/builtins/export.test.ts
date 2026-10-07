import './export'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { dismissJob, enqueueAnimationJob, exportJobs, exportQueueState, setJobError, setJobResult, setJobStatus, } from '@/utils/exportJobs'
import { executeCommand, getCommand, preflightLiveCommand } from '../registry'
import type { CommandContext } from '../types'
import type { NormalizedAnimationRender, NormalizedImageRender, } from '@/utils/exportRequests'

afterEach(() => {
  cancelSessionRecording()
  // The job store is module state shared by every test in this file.
  for (const job of [...exportJobs()]) dismissJob(job.id)
})

function exportContext(withHost = true) {
  const images: NormalizedImageRender[] = []
  const animations: NormalizedAnimationRender[] = []
  const ctx = {
    modal: { open: vi.fn() },
    ...(withHost
      ? {
          exportJobs: {
            renderImage: (request: NormalizedImageRender) => {
              images.push(request)
            },
            renderAnimation: (request: NormalizedAnimationRender) => {
              animations.push(request)
            },
          },
        }
      : {}),
  } as unknown as CommandContext
  return { ctx, images, animations }
}

function report(id: string, ctx: CommandContext, ...args: unknown[]) {
  return getCommand(id)?.report?.(ctx, ...args)
}

describe('export.renderImage', () => {
  it('queues a render with the modal defaults filled in', () => {
    const { ctx, images } = exportContext()

    executeCommand('export.renderImage', ctx, { width: 2560, height: 1440 })

    expect(images).toEqual([
      { width: 2560, height: 1440, quality: 0.9, embedFlame: true },
    ])
  })

  it('rounds an odd size up so a video encoder can take it', () => {
    const { ctx, images } = exportContext()

    executeCommand('export.renderImage', ctx, { width: 2561, height: 1441 })

    expect(images[0]).toMatchObject({ width: 2562, height: 1442 })
  })

  it('refuses sizes and qualities the modal would not offer', () => {
    const { ctx } = exportContext()
    const refuse = (options: unknown) => {
      const result = preflightLiveCommand('export.renderImage', ctx, [options])
      return 'error' in result ? result.error : undefined
    }

    expect(refuse({ width: 8192, height: 4608 })).toMatch(/between 16 and 4096/)
    expect(refuse({ width: 2560, height: 1440, quality: 2 })).toMatch(
      /"quality" must be between/,
    )
    expect(refuse({ width: 2560 })).toMatch(/"height"/)
    expect(refuse('2560x1440')).toMatch(/one options object/)
    expect(refuse({ width: 2560, height: 1440, embedFlame: 'yes' })).toMatch(
      /"embedFlame"/,
    )
  })

  it('reaches execute_command, which timeline.play does not', () => {
    const { ctx } = exportContext()

    const allowed = preflightLiveCommand('export.renderImage', ctx, [
      { width: 1920, height: 1080 },
    ])
    expect('args' in allowed).toBe(true)

    const refused = preflightLiveCommand('timeline.play', ctx, [])
    expect('error' in refused).toBe(true)
  })

  it('says so instead of pretending when the workspace has no export host', () => {
    const { ctx } = exportContext(false)

    executeCommand('export.renderImage', ctx, { width: 1024, height: 1024 })

    expect(report('export.renderImage', ctx)).toEqual({
      error: 'This workspace has no export host.',
    })
  })

  it('stays out of the recorded session', () => {
    const { ctx } = exportContext()

    expect(startSessionRecording(examples.example1).ok).toBe(true)
    executeCommand('export.renderImage', ctx, { width: 1024, height: 1024 })
    const session = stopSessionRecording()!

    expect(session.actions).toEqual([])
  })
})

describe('export.renderAnimation', () => {
  it('queues a render and leaves an omitted frame range to the workspace', () => {
    const { ctx, animations } = exportContext()

    executeCommand('export.renderAnimation', ctx, {
      width: 2560,
      height: 1440,
      fps: 60,
    })

    expect(animations).toEqual([
      {
        width: 2560,
        height: 1440,
        fps: 60,
        frameStart: undefined,
        frameEnd: undefined,
        codec: 'avc',
        quality: 0.9,
      },
    ])
  })

  it('holds fps, codec and the frame range to the modal rules', () => {
    const { ctx } = exportContext()
    const refuse = (options: unknown) => {
      const result = preflightLiveCommand('export.renderAnimation', ctx, [
        options,
      ])
      return 'error' in result ? result.error : undefined
    }
    const size = { width: 1920, height: 1080 }

    expect(refuse({ ...size, fps: 90 })).toMatch(/between 12 and 60/)
    expect(refuse({ ...size, fps: 59.94 })).toMatch(/whole number/)
    expect(refuse({ ...size })).toMatch(/"fps"/)
    expect(refuse({ ...size, fps: 30, codec: 'av1' })).toMatch(/"codec"/)
    expect(refuse({ ...size, fps: 30, frameStart: 90, frameEnd: 30 })).toMatch(
      /after "frameStart"/,
    )
    expect(refuse({ ...size, fps: 60, frameStart: 0, frameEnd: 9000 })).toMatch(
      /at most 3600 frames/,
    )
    expect(refuse({ ...size, fps: 60, frameStart: 0, frameEnd: 480 })).toBe(
      undefined,
    )
  })
})

describe('export.jobStatus', () => {
  beforeEach(() => {
    for (const job of [...exportJobs()]) dismissJob(job.id)
  })

  it('reports an empty queue', () => {
    const { ctx } = exportContext()

    expect(report('export.jobStatus', ctx)).toEqual({
      total: 0,
      pending: 0,
      hasPending: false,
    })
  })

  it('follows one animation job from queued to collectable', () => {
    const { ctx } = exportContext()
    // The real host is a Solid component; the store transitions it drives are
    // what a polling script actually sees, so drive them directly.
    const id = queueAnimationJob()

    expect(exportQueueState()).toMatchObject({
      total: 1,
      pending: 1,
      hasPending: true,
      latest: { id, type: 'animation', status: 'queued', totalFrames: 481 },
    })

    setJobStatus(id, 'rendering')
    expect(exportQueueState().active?.id).toBe(id)

    setJobResult(id, {
      blobUrl: 'blob:test',
      width: 2560,
      height: 1440,
      frames: 481,
    })

    const state = report('export.jobStatus', ctx) as ReturnType<
      typeof exportQueueState
    >
    expect(state.pending).toBe(0)
    // Still "pending" overall: finished but nobody has taken the file yet.
    expect(state.hasPending).toBe(true)
    expect(state.lastFinished).toMatchObject({
      id,
      width: 2560,
      height: 1440,
      frames: 481,
      downloaded: false,
    })
  })

  it('surfaces a failure so a poller stops instead of spinning', () => {
    const { ctx } = exportContext()
    const id = queueAnimationJob()

    setJobError(id, 'VideoEncoder rejected the configuration')

    expect(report('export.jobStatus', ctx)).toMatchObject({
      pending: 0,
      error: { id, message: 'VideoEncoder rejected the configuration' },
    })
  })

  it('takes no arguments', () => {
    const { ctx } = exportContext()

    expect(preflightLiveCommand('export.jobStatus', ctx, ['please'])).toEqual({
      error: 'export status takes no arguments',
    })
  })
})

/** A queued 8 s @ 60 fps animation job, straight into the store. */
function queueAnimationJob(): string {
  return enqueueAnimationJob({
    name: 'hero',
    flame: examples.example1,
    quality: 0.9,
    dimensions: { width: 2560, height: 1440 },
    fps: 60,
    frameStart: 0,
    frameEnd: 480,
    playCount: 1,
    codec: 'avc',
    embedMetadata: true,
    palette: undefined,
    blendFlame: undefined,
    blendWeight: 0,
    tracks: [],
    config: {
      fps: 60,
      timeScale: 1,
      startFrame: 0,
      endFrame: 480,
      loop: false,
    },
    session: undefined,
  })
}
