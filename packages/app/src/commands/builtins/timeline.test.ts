import './timeline'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { createTimelineState } from '@/utils/timeline'
import { executeCommand, preflightLiveCommand } from '../registry'
import type { CommandContext } from '../types'

/**
 * Bounded transport. `timeline.play` is a toggle with no end and is refused by
 * `execute_command` on purpose; these two are what a script gets instead, so
 * what matters is that the stop really happens and that a second call does not
 * leave a stray timer behind to pause playback someone else started.
 */

afterEach(() => {
  cancelSessionRecording()
  vi.useRealTimers()
})

function transportContext(options: { pause?: boolean } = {}) {
  let playing = false
  const play = vi.fn(() => {
    playing = true
  })
  const pause = vi.fn(() => {
    playing = false
  })
  const ctx = {
    timeline: {
      play,
      ...(options.pause === false ? {} : { pause }),
      isPlaying: () => playing,
    },
  } as unknown as CommandContext
  return { ctx, play, pause, isPlaying: () => playing }
}

describe('timeline.playFor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('plays and stops itself after the requested seconds', () => {
    const { ctx, play, pause, isPlaying } = transportContext()

    executeCommand('timeline.playFor', ctx, 8)

    expect(play).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(7999)
    expect(isPlaying()).toBe(true)
    vi.advanceTimersByTime(1)
    expect(pause).toHaveBeenCalledTimes(1)
    expect(isPlaying()).toBe(false)
  })

  it('replaces a pending stop rather than stacking two', () => {
    const { ctx, play, pause } = transportContext()

    executeCommand('timeline.playFor', ctx, 2)
    executeCommand('timeline.playFor', ctx, 6)

    // Already playing, so the second call does not re-press Play.
    expect(play).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    expect(pause).not.toHaveBeenCalled()
    vi.advanceTimersByTime(4000)
    expect(pause).toHaveBeenCalledTimes(1)
  })

  it('refuses to start playback it would not be able to stop', () => {
    const { ctx, play } = transportContext({ pause: false })

    executeCommand('timeline.playFor', ctx, 5)

    expect(play).not.toHaveBeenCalled()
  })

  it('takes one duration, bounded, and is reachable from execute_command', () => {
    const { ctx } = transportContext()
    const refuse = (...args: unknown[]) => {
      const result = preflightLiveCommand('timeline.playFor', ctx, args)
      return 'error' in result ? result.error : undefined
    }

    expect(refuse(8)).toBe(undefined)
    expect(refuse(0)).toMatch(/duration in seconds/)
    expect(refuse(-1)).toMatch(/duration in seconds/)
    expect(refuse(601)).toMatch(/up to 600/)
    expect(refuse('8')).toMatch(/duration in seconds/)
    expect(refuse(8, 8)).toMatch(/one duration/)
  })

  it('is wall-clock transport, so it is not a step in the session', () => {
    const { ctx } = transportContext()

    expect(startSessionRecording(examples.example1).ok).toBe(true)
    executeCommand('timeline.playFor', ctx, 3)
    const session = stopSessionRecording()!

    expect(session.actions).toEqual([])
  })
})

describe('timeline.stop', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('stops now and cancels the pending stop', () => {
    const { ctx, pause } = transportContext()

    executeCommand('timeline.playFor', ctx, 10)
    executeCommand('timeline.stop', ctx)

    expect(pause).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(20_000)
    // The cancelled timer must not pause playback started after it.
    expect(pause).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the timeline is already stopped', () => {
    const { ctx, pause } = transportContext()

    executeCommand('timeline.stop', ctx)

    expect(pause).not.toHaveBeenCalled()
  })
})

/**
 * The same two commands against the workspace's real transport.
 *
 * A fake `playing` boolean cannot show the defect this covers: whether a
 * pending stop still belongs to the playback its own call started is a
 * question about a signal changing between the two, and that signal lives in
 * `createTimelineState`. It is also the only honest evidence that
 * `timeline.stop` stops anything — the real state says so, rather than a mock
 * agreeing with a mock.
 */
describe('bounded transport, against the real timeline state', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  // No `createRoot` around a test body on purpose (as `utils/timeline.test.ts`
  // does): Solid runs one update cycle per root body, so wrapping these would
  // collapse a pause and the Play after it into a single cycle — which no
  // interaction produces, and which would hide the watcher doing its job.
  function realTransport() {
    const timeline = createTimelineState()
    const ctx = {
      timeline: {
        play: timeline.play,
        pause: timeline.pause,
        isPlaying: timeline.isPlaying,
      },
    } as unknown as CommandContext
    return { timeline, ctx }
  }

  it('starts the real transport and stops it on its own deadline', () => {
    const { timeline, ctx } = realTransport()

    executeCommand('timeline.playFor', ctx, 4)
    expect(timeline.isPlaying()).toBe(true)
    vi.advanceTimersByTime(3999)
    expect(timeline.isPlaying()).toBe(true)
    vi.advanceTimersByTime(1)
    expect(timeline.isPlaying()).toBe(false)
  })

  it('timeline.stop really stops the real transport', () => {
    const { timeline, ctx } = realTransport()

    executeCommand('timeline.playFor', ctx, 60)
    expect(timeline.isPlaying()).toBe(true)
    executeCommand('timeline.stop', ctx)
    expect(timeline.isPlaying()).toBe(false)
  })

  it('a stale deadline leaves a playback it did not start alone', () => {
    const { timeline, ctx } = realTransport()

    executeCommand('timeline.playFor', ctx, 10)
    // The viewer stops it by hand and starts it again, inside the window. The
    // run the deadline was scheduled for is over; what is playing now is
    // theirs, and the deadline has no claim on it.
    timeline.pause()
    timeline.play()

    vi.advanceTimersByTime(20_000)
    expect(timeline.isPlaying()).toBe(true)

    executeCommand('timeline.stop', ctx)
  })
})
