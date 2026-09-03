import '@/commands/builtins'
import { afterEach, describe, expect, it } from 'vitest'
import { executeCommand } from '@/commands/registry'
import { recorderStream } from '@/recorder/recorder'
import { createTestFlame } from '@/webmcp/testUtils'
import { duel, duelActive, duelRemainingMs, runningDuel, startDuel, stopDuel, } from './duel'

const flame = createTestFlame()
const base = {
  rivalFlame: flame,
  playerFlame: flame,
  durationMs: 180_000,
  recording: 'both' as const,
}

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
