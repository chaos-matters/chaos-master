import { afterEach, describe, expect, it } from 'vitest'
import { agentDriving, drivingState, endPilot, notePilotStep, pilot, pilotLog, pilotStepsRemaining, resetPilot, startPilot, } from './pilot'

const start = () =>
  startPilot({
    mode: 'teach',
    topic: 'variations',
    title: 'Teaching: Variations',
    stepBudget: 2,
    allowed: ['flame.'],
    qualityRankAtStart: 1,
    now: 1000,
  })

describe('pilot state machine', () => {
  afterEach(() => {
    resetPilot()
  })

  it('starts idle, drives, counts steps against the budget, ends', () => {
    expect(pilot()).toEqual({ phase: 'idle' })
    expect(start()).toEqual({ ok: true })
    expect(agentDriving()).toBe(true)
    expect(notePilotStep('command', 'Add transform')).toBe(1)
    expect(notePilotStep('narrate', 'Now the colour')).toBe(0)
    expect(notePilotStep('command', 'One too many')).toBe(-1)
    expect(pilotStepsRemaining()).toBe(0)
    expect(drivingState()?.steps).toBe(2)
    const ended = endPilot('finished', {
      title: 'Three families',
      sessionName: 'Lesson: Variations — Three families',
      now: 61_000,
    })
    expect(ended).toMatchObject({
      phase: 'ended',
      reason: 'finished',
      steps: 2,
      durationMs: 60_000,
    })
    expect(agentDriving()).toBe(false)
    expect(pilotLog().map((e) => e.kind)).toEqual([
      'system',
      'command',
      'narrate',
      'system',
    ])
  })

  it('refuses to start twice and ignores steps when not driving', () => {
    expect(start()).toEqual({ ok: true })
    expect(start()).toMatchObject({ ok: false })
    resetPilot()
    expect(notePilotStep('command', 'x')).toBe(-1)
    expect(endPilot('finished', {})).toBeUndefined()
  })
})
