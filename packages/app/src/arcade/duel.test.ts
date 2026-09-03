import '@/commands/builtins'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeCommand } from '@/commands/registry'
import { recorderStream } from '@/recorder/recorder'
import { createTestFlame } from '@/webmcp/testUtils'
import { duel, duelActive, duelReady, duelRemainingMs, markDuelReady, runningDuel, startDuel, stopDuel, } from './duel'

const flame = createTestFlame()
const base = {
  rivalFlame: flame,
  playerFlame: flame,
  durationMs: 180_000,
  recording: 'both' as const,
}

afterEach(() => {
  if (duelActive()) stopDuel()
  recorderStream('player').cancel()
  recorderStream('rival').cancel()
})

describe('duel state', () => {
  afterEach(() => {
    if (duelActive()) stopDuel()
    recorderStream('player').cancel()
    recorderStream('rival').cancel()
  })

  it('starts both streams from one time origin and stops both', () => {
    const started = startDuel({ ...base, now: 1000 })
    expect(started).toMatchObject({ ok: true })
    expect(duelActive()).toBe(true)
    expect(recorderStream('player').isRecording()).toBe(true)
    expect(recorderStream('rival').isRecording()).toBe(true)
    expect(runningDuel()?.endsAt).toBe(181_000)
    expect(duelRemainingMs(91_000)).toBe(90_000)
    // Never negative: the clock reads zero once it is spent.
    expect(duelRemainingMs(999_999)).toBe(0)

    const sessions = stopDuel()
    expect(sessions.player).toBeDefined()
    expect(sessions.rival).toBeDefined()
    expect(duel()).toEqual({ phase: 'idle' })
    expect(recorderStream('rival').isRecording()).toBe(false)
  })

  it('records only the chosen sides', () => {
    startDuel({ ...base, recording: 'rival', now: 0 })
    expect(recorderStream('player').isRecording()).toBe(false)
    expect(recorderStream('rival').isRecording()).toBe(true)
    const sessions = stopDuel()
    expect(sessions.player).toBeUndefined()
    expect(sessions.rival).toBeDefined()
  })

  it('refuses to start twice', () => {
    startDuel({ ...base, now: 0 })
    expect(startDuel({ ...base, now: 0 })).toMatchObject({ ok: false })
  })

  it('routes an agent edit to the rival seat only', () => {
    const started = startDuel({ ...base, now: 0 })
    if (!('rival' in started)) throw new Error('expected a rival seat')
    executeCommand('flame.setExposure', started.rival.ctx, 0.8)
    expect(started.rival.flame().renderSettings.exposure).toBe(0.8)
    const sessions = stopDuel()
    expect(sessions.rival?.actions).toHaveLength(1)
    expect(sessions.player?.actions).toEqual([])
  })
})

describe('the clock', () => {
  it('ends the duel itself, so a modal over the stage cannot outlast it', () => {
    vi.useFakeTimers()
    try {
      const expired = vi.fn()
      startDuel({
        rivalFlame: createTestFlame(),
        playerFlame: createTestFlame(),
        durationMs: 1000,
        recording: 'both',
        onExpire: expired,
      })
      vi.advanceTimersByTime(999)
      expect(expired).not.toHaveBeenCalled()
      vi.advanceTimersByTime(2)
      expect(expired).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not fire after the duel has already been stopped', () => {
    vi.useFakeTimers()
    try {
      const expired = vi.fn()
      startDuel({
        rivalFlame: createTestFlame(),
        playerFlame: createTestFlame(),
        durationMs: 1000,
        recording: 'both',
        onExpire: expired,
      })
      stopDuel()
      vi.advanceTimersByTime(5000)
      expect(expired).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('markDuelReady', () => {
  it('records the title without ending anything', () => {
    startDuel({
      rivalFlame: createTestFlame(),
      playerFlame: createTestFlame(),
      durationMs: 1000,
      recording: 'both',
    })
    expect(markDuelReady({ title: '  Ember lattice  ' })).toBe(true)
    expect(duelReady()?.title).toBe('Ember lattice')
    expect(duelActive()).toBe(true)
  })

  it('refuses when no duel is running', () => {
    expect(markDuelReady({ title: 'nothing' })).toBe(false)
  })
})

describe('what a duel records', () => {
  it("starts the viewer's side through the workspace's own facade", () => {
    const startPlayer = vi.fn((now: number) => {
      recorderStream('player').start(flame, {}, now)
      return { ok: true } as const
    })

    startDuel({ ...base, startPlayer, now: 1234 })

    // The facade snapshots timeline/audio/view state and pauses a playing
    // timeline; bypassing it made the duel take the only one in the app that
    // begins with none of that.
    expect(startPlayer).toHaveBeenCalledWith(1234)
    expect(recorderStream('player').isRecording()).toBe(true)
    expect(recorderStream('rival').isRecording()).toBe(true)
  })

  it('leaves alone a recording the duel did not start', () => {
    // The viewer was already recording something of their own.
    recorderStream('player').start(flame)
    startDuel({ ...base, recording: 'rival' })

    const sessions = stopDuel()

    expect(sessions.player).toBeUndefined()
    expect(recorderStream('player').isRecording()).toBe(true)
    expect(sessions.rival).toBeDefined()
  })
})
