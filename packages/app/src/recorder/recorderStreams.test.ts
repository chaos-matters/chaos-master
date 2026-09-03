import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestFlame } from '@/webmcp/testUtils'
import { anySessionRecording, cancelSessionRecording, recordCommandExecution, recorderStream, recordSyntheticAction, reportDocumentWrite, reportUnreplayableOnce, startSessionRecording, stopSessionRecording, withRecordingSuppressed, } from './recorder'
import type { RecordableCommand } from './recorder'
import type { RecordedSession } from './schema'

const setExposure: RecordableCommand = {
  id: 'flame.setExposure',
  label: 'Set exposure',
}
const zoomTo: RecordableCommand = {
  id: 'camera.zoomTo',
  label: 'Zoom to',
  coalesceKey: () => 'zoom',
}

/** Deterministic clocks: `performance.now` counts up 10 ms per read, `Date`
 *  is pinned, so two runs of the same scenario produce equal sessions. */
function pinClocks() {
  let tick = 0
  vi.spyOn(globalThis.performance, 'now').mockImplementation(() => {
    tick += 10
    return tick
  })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-03T12:00:00.000Z'))
}

/**
 * The scenario every parity check runs: a plain command, a coalescing pair,
 * an unnamed write, a synthetic action and a deduplicated fidelity marker.
 */
function runScenario(api: {
  start: () => void
  command: (cmd: RecordableCommand, args: unknown[]) => void
  documentWrite: () => void
  synthetic: () => void
  unreplayableOnce: () => void
  stop: () => RecordedSession | undefined
}): RecordedSession | undefined {
  api.start()
  api.command(setExposure, [0.4])
  api.command(zoomTo, [2])
  api.command(zoomTo, [3])
  api.documentWrite()
  api.synthetic()
  api.unreplayableOnce()
  api.unreplayableOnce()
  return api.stop()
}

describe('recorder streams', () => {
  const flame = createTestFlame()

  beforeEach(() => {
    pinClocks()
  })
  afterEach(() => {
    recorderStream('player').cancel()
    recorderStream('rival').cancel()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('records the same session through the legacy surface and a non-default stream', () => {
    const legacy = runScenario({
      start: () => startSessionRecording(flame),
      command: (cmd, args) => {
        recordCommandExecution(cmd, args, () => {})
      },
      documentWrite: () => {
        reportDocumentWrite('slider')
      },
      synthetic: () => {
        recordSyntheticAction('flame.load', [flame], 'Load')
      },
      unreplayableOnce: () => {
        reportUnreplayableOnce('k', 'audio tick')
      },
      stop: stopSessionRecording,
    })
    const rival = recorderStream('rival')
    const viaStream = runScenario({
      start: () => rival.start(flame),
      command: (cmd, args) => {
        rival.recordCommandExecution(cmd, args, () => {})
      },
      documentWrite: () => {
        rival.reportDocumentWrite('slider')
      },
      synthetic: () => {
        rival.recordSyntheticAction('flame.load', [flame], 'Load')
      },
      unreplayableOnce: () => {
        rival.reportUnreplayableOnce('k', 'audio tick')
      },
      stop: () => rival.stop(),
    })
    expect(legacy).toBeDefined()
    // Timestamps come from the pinned clock, so they match exactly too.
    expect(viaStream).toEqual(legacy)
    // The scenario's shape, so a silent no-op cannot pass as parity.
    expect(legacy?.actions.map((a) => a.id)).toEqual([
      'flame.setExposure',
      'camera.zoomTo',
      'flame.load',
    ])
    expect(legacy?.actions[1]?.args).toEqual([3])
    expect(legacy?.unnamedWriteCount).toBe(2)
  })

  it('keeps two streams independent', () => {
    const player = recorderStream('player')
    const rival = recorderStream('rival')
    expect(player.start(flame)).toEqual({ ok: true })
    expect(rival.start(flame)).toEqual({ ok: true })
    expect(anySessionRecording()).toBe(true)

    rival.recordCommandExecution(setExposure, [0.9], () => {})
    rival.reportDocumentWrite('rival slider')

    expect(player.actionCount()).toBe(0)
    expect(player.unnamedWriteCount()).toBe(0)
    expect(rival.actionCount()).toBe(1)
    expect(rival.unnamedWriteCount()).toBe(1)

    const playerSession = player.stop()
    expect(playerSession?.actions).toEqual([])
    expect(rival.isRecording()).toBe(true)
    expect(anySessionRecording()).toBe(true)
    rival.stop()
    expect(anySessionRecording()).toBe(false)
  })

  it('never folds a gesture across streams', () => {
    const player = recorderStream('player')
    const rival = recorderStream('rival')
    player.start(flame)
    rival.start(flame)
    player.recordCommandExecution(zoomTo, [2], () => {})
    rival.recordCommandExecution(zoomTo, [5], () => {})
    player.recordCommandExecution(zoomTo, [3], () => {})
    expect(player.stop()?.actions.map((a) => a.args)).toEqual([[3]])
    expect(rival.stop()?.actions.map((a) => a.args)).toEqual([[5]])
  })

  it('keeps gesture boundaries per stream', () => {
    const player = recorderStream('player')
    const rival = recorderStream('rival')
    player.start(flame)
    rival.start(flame)
    player.recordCommandExecution(zoomTo, [2], () => {})
    // A drag boundary on the rival must not end the player's coalescing run.
    rival.notePreviewStarted()
    player.recordCommandExecution(zoomTo, [3], () => {})
    expect(player.stop()?.actions).toHaveLength(1)
    rival.stop()
  })

  it('counts live mutations per stream', () => {
    const player = recorderStream('player')
    const rival = recorderStream('rival')
    const before = rival.liveWorkspaceMutationGeneration()
    player.recordCommandExecution(setExposure, [0.1], () => {})
    player.reportDocumentWrite('x')
    expect(rival.liveWorkspaceMutationGeneration()).toBe(before)
    expect(player.liveWorkspaceMutationGeneration()).toBeGreaterThan(before)
  })

  it('suppresses every stream, deliberately', () => {
    // Pinned so a later scoping of suppressDepth is a decision, not a drift.
    const player = recorderStream('player')
    const rival = recorderStream('rival')
    player.start(flame)
    rival.start(flame)
    withRecordingSuppressed(() => {
      rival.recordCommandExecution(setExposure, [0.2], () => {
        player.recordCommandExecution(setExposure, [0.3], () => {})
      })
    })
    expect(player.stop()?.actions).toEqual([])
    expect(rival.stop()?.actions).toEqual([])
  })

  it('lets a duel share one time origin', () => {
    const player = recorderStream('player')
    const rival = recorderStream('rival')
    // One origin, read once and behind the pinned clock, so both takes
    // measure forwards from the same zero instead of from two starts.
    const origin = globalThis.performance.now()
    expect(player.start(flame, {}, origin)).toEqual({ ok: true })
    expect(rival.start(flame, {}, origin)).toEqual({ ok: true })
    player.recordCommandExecution(setExposure, [0.4], () => {})
    // A marker on the same clock, offset from the same origin. The player's
    // step falls before it and the rival's after, which is what "one shared
    // timeline" means for two logs.
    const marker = globalThis.performance.now() - origin
    rival.recordCommandExecution(setExposure, [0.5], () => {})
    const p = player.stop()?.actions[0]?.t ?? -1
    const r = rival.stop()?.actions[0]?.t ?? -1
    expect(p).toBeGreaterThan(0)
    expect(p).toBeLessThan(marker)
    expect(r).toBeGreaterThan(marker)
  })

  it('cancels one stream without touching the other', () => {
    const player = recorderStream('player')
    const rival = recorderStream('rival')
    player.start(flame)
    rival.start(flame)
    cancelSessionRecording()
    expect(player.isRecording()).toBe(false)
    expect(rival.isRecording()).toBe(true)
    rival.cancel()
  })
})
