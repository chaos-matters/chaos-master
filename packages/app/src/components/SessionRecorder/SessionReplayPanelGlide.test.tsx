import '@/commands/builtins'
import { fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeReplayCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { glideEnabled, glideQualityPreference, restoreGlideSwitches, } from '@/flame/glide/runtime'
import { cancelSessionRecording } from '@/recorder/recorder'
import { timelineReplayPlayback } from '@/recorder/replayPlayback'
import { SESSION_FORMAT_VERSION } from '@/recorder/schema'
import { deepClone } from '@/utils/clone'
import { createTimelineState } from '@/utils/timeline'
import { setFollowCamEnabled } from './recorderUi'
import { SessionReplayPanel } from './SessionReplayPanel'
import type { CommandContext } from '@/commands/types'
import type { ReplayTarget } from '@/recorder/replay'
import type { ReplayVideoExportRequest } from '@/recorder/replayInterfaceVideo'
import type { RecordedSession } from '@/recorder/schema'

vi.mock('@/recorder/replayInterfaceVideo', () => ({
  replayInterfaceCaptureSupported: () => true,
}))

/**
 * The full-interface export records the live replay, so the Glide switches a
 * take flips are the viewer's own for as long as it runs. However the export
 * ends, they go back; one that ends early inside a play window leaves the
 * timeline paused where it was.
 */

const VIEWER = { enabled: false, quality: 'balanced' } as const

function makeSession(): RecordedSession {
  return {
    version: SESSION_FORMAT_VERSION,
    app: { version: 'test', flameSchemaVersion: '1.0' },
    createdAt: new Date(0).toISOString(),
    initial: deepClone(examples.example1),
    actions: [
      { t: 0, id: 'glide.setEnabled', args: [true], label: 'Animate' },
      { t: 1000, id: 'glide.setQuality', args: ['full'], label: 'Full' },
      { t: 2000, id: 'glide.setQuality', args: ['responsive'], label: 'Fast' },
    ],
    unnamedWriteCount: 0,
  }
}

function makeTarget(): ReplayTarget {
  const ctx = {} as CommandContext
  return {
    loadInitial: () => {},
    execute: (id, args) => executeReplayCommand(id, ctx, ...args),
  }
}

/** Four seconds of play at 25 fps: a take that is one play window. */
function makePlayingSession(): RecordedSession {
  return {
    ...makeSession(),
    actions: [
      { t: 0, id: 'timeline.setPlaying', args: [true, 0] },
      { t: 4000, id: 'timeline.setPlaying', args: [false, 100, 100] },
    ],
  }
}

/** A workspace-shaped timeline the replay paces through its window. */
function makeTimelineTarget() {
  const raw = createTimelineState()
  raw.setConfig({
    ...raw.config(),
    fps: 25,
    timeScale: 1,
    autoFps: false,
    startFrame: 0,
    endFrame: 600,
    loop: true,
  })
  raw.setAnimationEnabled(true)
  const ctx = {
    timeline: {
      setCurrentFrame: (frame: number) => {
        raw.goToFrame(frame)
        return frame
      },
      play: raw.play,
      pause: raw.pause,
    },
  } as unknown as CommandContext
  const target: ReplayTarget = {
    loadInitial: () => {
      if (raw.isPlaying()) raw.pause()
    },
    execute: (id, args) => executeReplayCommand(id, ctx, ...args),
    playback: timelineReplayPlayback(raw),
  }
  return { raw, target }
}

const switches = () => ({
  enabled: glideEnabled(),
  quality: glideQualityPreference(),
})

/** Start a full-interface export whose capture the test drives by hand. */
function startExport(
  run: (
    request: Extract<ReplayVideoExportRequest, { mode: 'interface' }>,
  ) => Promise<void>,
  session = makeSession(),
  target = makeTarget(),
) {
  const exportVideo = vi.fn((request: ReplayVideoExportRequest) => {
    if (request.mode !== 'interface') throw new Error('expected interface')
    return run(request)
  })
  const view = render(() => (
    <SessionReplayPanel
      session={session}
      target={target}
      onExportVideo={exportVideo}
      onClose={() => {}}
    />
  ))
  fireEvent.click(screen.getByRole('button', { name: 'Full interface' }))
  fireEvent.click(screen.getByRole('button', { name: 'Record full interface' }))
  expect(exportVideo).toHaveBeenCalledTimes(1)
  return view
}

async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('the full-interface export and the Glide switches', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    cancelSessionRecording()
    setFollowCamEnabled(false)
    restoreGlideSwitches(VIEWER)
  })
  afterEach(() => {
    cancelSessionRecording()
    setFollowCamEnabled(true)
    vi.useRealTimers()
    restoreGlideSwitches({ enabled: false, quality: 'auto' })
  })

  it('hands them back when the export succeeds', async () => {
    let played: Promise<void> | undefined
    const { unmount } = startExport((request) => {
      request.prepareReplay()
      played = request.playReplay(new AbortController().signal)
      return played
    })
    vi.advanceTimersByTime(1000)
    expect(switches()).toEqual({ enabled: true, quality: 'full' })
    vi.advanceTimersByTime(5000)
    await played
    expect(switches()).toEqual(VIEWER)
    unmount()
  })

  it('hands them back when the export is cancelled midway', async () => {
    const controller = new AbortController()
    const { unmount } = startExport((request) => {
      request.prepareReplay()
      return request.playReplay(controller.signal)
    })
    vi.advanceTimersByTime(1000)
    expect(switches()).toEqual({ enabled: true, quality: 'full' })
    controller.abort(new Error('Full-interface recording was cancelled'))
    await settle()
    expect(switches()).toEqual(VIEWER)
    vi.advanceTimersByTime(5000)
    expect(switches()).toEqual(VIEWER)
    unmount()
  })

  it('hands them back when the capture fails while the replay runs', async () => {
    let fail: ((error: Error) => void) | undefined
    const { unmount } = startExport((request) => {
      request.prepareReplay()
      void request.playReplay(new AbortController().signal).catch(() => {})
      return new Promise<void>((_, reject) => {
        fail = reject
      })
    })
    vi.advanceTimersByTime(1000)
    expect(switches()).toEqual({ enabled: true, quality: 'full' })
    fail?.(new Error('The encoder gave up'))
    await settle()
    expect(screen.getByText('The encoder gave up')).toBeTruthy()
    expect(switches()).toEqual(VIEWER)
    vi.advanceTimersByTime(5000)
    expect(switches()).toEqual(VIEWER)
    unmount()
  })
})

describe('the full-interface export ending inside a play window', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    cancelSessionRecording()
    setFollowCamEnabled(false)
  })
  afterEach(() => {
    cancelSessionRecording()
    setFollowCamEnabled(true)
    vi.useRealTimers()
  })

  it('pauses the timeline where it is when the export is cancelled', async () => {
    const { raw, target } = makeTimelineTarget()
    const controller = new AbortController()
    const { unmount } = startExport(
      (request) => {
        request.prepareReplay()
        return request.playReplay(controller.signal)
      },
      makePlayingSession(),
      target,
    )
    vi.advanceTimersByTime(1500)
    expect(raw.isPlaying()).toBe(true)
    controller.abort(new Error('Full-interface recording was cancelled'))
    await settle()
    expect(raw.isPlaying()).toBe(false)
    expect(raw.currentFrame()).toBe(37)
    unmount()
  })

  it('pauses the timeline where it is when the capture fails', async () => {
    const { raw, target } = makeTimelineTarget()
    let fail: ((error: Error) => void) | undefined
    const { unmount } = startExport(
      (request) => {
        request.prepareReplay()
        void request.playReplay(new AbortController().signal).catch(() => {})
        return new Promise<void>((_, reject) => {
          fail = reject
        })
      },
      makePlayingSession(),
      target,
    )
    vi.advanceTimersByTime(1500)
    expect(raw.isPlaying()).toBe(true)
    fail?.(new Error('The encoder gave up'))
    await settle()
    expect(raw.isPlaying()).toBe(false)
    expect(raw.currentFrame()).toBe(37)
    unmount()
  })
})
