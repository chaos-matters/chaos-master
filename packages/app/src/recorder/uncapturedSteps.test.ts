/**
 * How a take's uncaptured steps read wherever they are shown: the recorder
 * controls, the library, the replay panel, the export notice and the console
 * line a stop writes all take their words from here.
 */
import { describe, expect, it } from 'vitest'
import { createUncapturedLog, describeUncapturedStep, noteUncapturedStep, summarizeUncapturedSteps, UNCAPTURED_DETAILS_MISSING, uncapturedJsonChars, uncapturedSessionFields, } from './uncapturedSteps'

describe('uncaptured step names', () => {
  it('reads as the reason and the moment in the take', () => {
    expect(
      describeUncapturedStep({
        t: 43_000,
        reason: 'Undo of a change made before recording started',
      }),
    ).toBe('Undo of a change made before recording started, at 0:43')
    // Minutes keep counting past the hour rather than wrapping.
    expect(describeUncapturedStep({ t: 3_723_999, reason: 'Exposure' })).toBe(
      'Exposure, at 62:03',
    )
  })

  it('names every saved step in the order it happened', () => {
    const summary = summarizeUncapturedSteps({
      unnamedWriteCount: 2,
      uncapturedSteps: [
        { t: 1_000, reason: 'Exposure, made outside the recorded commands' },
        { t: 61_000, reason: 'Undo with nothing left to undo' },
      ],
    })
    expect(summary.lines).toEqual([
      'Exposure, made outside the recorded commands, at 0:01',
      'Undo with nothing left to undo, at 1:01',
    ])
    expect(summary.firstAtMs).toBe(1_000)
    expect(summary.note).toBeUndefined()
  })

  it('says so when the version that recorded a take did not save the names', () => {
    const summary = summarizeUncapturedSteps({ unnamedWriteCount: 1 })
    expect(summary.lines).toEqual([])
    expect(summary.firstAtMs).toBeUndefined()
    expect(summary.note).toBe(UNCAPTURED_DETAILS_MISSING)
    expect(UNCAPTURED_DETAILS_MISSING).toBe(
      'Details were not saved by the version that recorded it.',
    )
  })

  it('counts the steps a full list could not name', () => {
    const summary = summarizeUncapturedSteps({
      unnamedWriteCount: 3,
      uncapturedSteps: [{ t: 0, reason: 'Exposure' }],
    })
    expect(summary.lines).toEqual(['Exposure, at 0:00'])
    expect(summary.note).toBe('2 more were not listed.')
  })

  it('adds exactly its own length to the session JSON, a flood included', () => {
    // The recorder budgets a take's file without serializing it after every
    // write, so what a log says it adds has to be what it adds, to the
    // character, past the names a file keeps as well as short of them.
    for (const steps of [0, 1, 3, 2_500]) {
      const log = createUncapturedLog()
      for (let i = 0; i < steps; i++) {
        noteUncapturedStep(log, i * 1_000, `Edit "${i}"`)
      }
      const clean = JSON.stringify({ actions: [], unnamedWriteCount: 0 })
      const logged = JSON.stringify({
        actions: [],
        ...uncapturedSessionFields(log),
      })
      expect(logged.length - clean.length).toBe(uncapturedJsonChars(log))
    }
  })

  it('has nothing to say about a clean take', () => {
    expect(summarizeUncapturedSteps({ unnamedWriteCount: 0 })).toEqual({
      count: 0,
      lines: [],
      firstAtMs: undefined,
      note: undefined,
    })
  })
})
