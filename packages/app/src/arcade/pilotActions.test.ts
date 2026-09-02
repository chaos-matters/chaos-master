import '@/commands/builtins'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { pilot, pilotLog, resetPilot, startPilot } from './pilot'
import { finishPilot } from './pilotActions'
import type { PilotEnded } from './pilot'

function drivingCtx() {
  const ctx = createMockCommandContext()
  ctx.recorder!.stop = vi.fn(
    () =>
      ({
        version: 1,
        actions: [{ t: 0, id: 'flame.setExposure', args: [0.3] }],
      }) as never,
  )
  startPilot({
    mode: 'teach',
    topic: 'color',
    title: 'Teaching: Colour and tone',
    stepBudget: 25,
    allowed: ['flame.'],
    qualityRankAtStart: 1,
  })
  return ctx
}

const ended = () => pilot() as PilotEnded

describe('finishPilot', () => {
  afterEach(() => {
    resetPilot()
  })

  it('marks the take saved once the library write settles', async () => {
    const ctx = drivingCtx()
    const result = await finishPilot(ctx, 'finished', { title: 'Warm tones' })
    expect(result).toMatchObject({ phase: 'ended' })
    expect(ended().sessionName).toBe('Lesson: Colour and tone — Warm tones')
    expect(ended().saved).toBe(true)
    expect(ctx.arcade!.toast).toHaveBeenCalledWith(
      'Saved "Lesson: Colour and tone — Warm tones"',
    )
  })

  it('reports a failed save without losing the take', async () => {
    const ctx = drivingCtx()
    ctx.recorder!.save = vi.fn(() => Promise.reject(new Error('quota')))
    const result = await finishPilot(ctx, 'stopped', { title: 'Warm tones' })

    // The session still ended, and the end card can still name it.
    expect(result).toMatchObject({ phase: 'ended', reason: 'stopped' })
    expect(ended().sessionName).toBe(
      'Lesson (stopped): Colour and tone — Warm tones',
    )
    expect(ended().saved).toBe(false)
    expect(ctx.arcade!.toast).toHaveBeenCalledWith(
      'Could not save "Lesson (stopped): Colour and tone — Warm tones" to your library',
    )
    expect(pilotLog().some((entry) => entry.kind === 'error')).toBe(true)
  })

  it('leaves `saved` unset while the write is still in flight', async () => {
    const ctx = drivingCtx()
    let release: () => void = () => {}
    ctx.recorder!.save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const finishing = finishPilot(ctx, 'finished', { title: 'Warm tones' })
    expect(pilot().phase).toBe('ended')
    expect(ended().saved).toBeUndefined()
    release()
    await finishing
    expect(ended().saved).toBe(true)
  })
})
