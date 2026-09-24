/**
 * The leave-site prompt, installed exactly while an agent's take records.
 *
 * Each way a take starts puts the `beforeunload` listener on `window`, and
 * each way one ends takes it off again: finished and saved, stopped, a save
 * that fails, the reasons no caller uses yet, a reset, and a duel's end. With
 * no take there is no listener at all.
 */
import '@/commands/builtins'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recorderStream } from '@/recorder/recorder'
import { clearWebMcpContext, setWebMcpTarget } from '@/webmcp/contextBridge'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { duelActive, startDuel, stopDuel } from './duel'
import { finishDuel } from './duelActions'
import { installLeaveSitePrompt } from './leaveSitePrompt'
import { endPilot, pilot, resetPilot, startPilot } from './pilot'
import { finishPilot } from './pilotActions'
import type { RecordedSession } from '@/recorder/schema'

/** Would leaving now ask first? */
function asks(): boolean {
  const ev = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(ev)
  return ev.defaultPrevented
}

function take(lock: 'screen' | 'seat' = 'screen') {
  startPilot({
    mode: lock === 'screen' ? 'cinema' : 'duel',
    title: 'Animating your flame',
    stepBudget: 25,
    allowed: ['timeline.'],
    qualityRankAtStart: 1,
    seatId: lock === 'screen' ? 'player' : 'rival',
    lock,
  })
}

function recordingCtx(save: () => Promise<void> = () => Promise.resolve()) {
  const ctx = createMockCommandContext()
  ctx.recorder!.stop = vi.fn(
    () =>
      ({
        version: 1,
        actions: [{ t: 0, id: 'flame.setExposure', args: [0.3] }],
      }) as unknown as RecordedSession,
  )
  ctx.recorder!.save = vi.fn(save)
  return ctx
}

let remove: () => void

beforeEach(() => {
  remove = installLeaveSitePrompt()
})

afterEach(() => {
  if (duelActive()) stopDuel()
  resetPilot()
  clearWebMcpContext('player')
  clearWebMcpContext('rival')
  recorderStream('player').cancel()
  recorderStream('rival').cancel()
  remove()
  vi.restoreAllMocks()
})

describe('the leave-site prompt', () => {
  it('asks nothing with no take', () => {
    expect(asks()).toBe(false)
  })

  it('asks while a take records, under the screen lock or a seat lock', () => {
    take('screen')
    expect(asks()).toBe(true)
    resetPilot()

    take('seat')
    expect(asks()).toBe(true)
  })

  it('stops asking when the take finishes, before and after its save', async () => {
    take()
    const ended = finishPilot(recordingCtx(), 'finished', { title: 'Waltz' })
    // The recorder stopped and the pilot left `driving` in this same tick.
    expect(asks()).toBe(false)

    await ended
    expect(pilot()).toMatchObject({ phase: 'ended', saved: true })
    expect(asks()).toBe(false)
  })

  it('stops asking when the viewer stops the take', async () => {
    take()
    await finishPilot(recordingCtx(), 'stopped')
    expect(asks()).toBe(false)
  })

  it('stops asking when the save fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    take()
    await finishPilot(
      recordingCtx(() => Promise.reject(new Error('quota'))),
      'finished',
    )
    expect(pilot()).toMatchObject({ phase: 'ended', saved: false })
    expect(asks()).toBe(false)
  })

  it('stops asking on the error and budget endings', () => {
    for (const reason of ['error', 'budget'] as const) {
      take()
      expect(asks()).toBe(true)
      endPilot(reason, {})
      expect(asks()).toBe(false)
      resetPilot()
    }
  })

  it('stops asking when the session is reset mid-take', () => {
    take()
    resetPilot()
    expect(asks()).toBe(false)
  })

  it('stops asking when a duel ends', async () => {
    startDuel({
      rivalFlame: createTestFlame(),
      playerFlame: createTestFlame(),
      durationMs: 60_000,
      recording: 'both',
      now: 0,
    })
    take('seat')
    setWebMcpTarget('rival')
    expect(asks()).toBe(true)

    await finishDuel(recordingCtx(), 'finished')

    expect(pilot().phase).toBe('ended')
    expect(asks()).toBe(false)
  })

  it('is one listener however often boot asks for it, and none once removed', () => {
    expect(installLeaveSitePrompt()).toBe(remove)
    const add = vi.spyOn(window, 'addEventListener')
    take()
    expect(
      add.mock.calls.filter(([type]) => type === 'beforeunload'),
    ).toHaveLength(1)
    resetPilot()

    remove()
    take()
    expect(asks()).toBe(false)
  })
})
