import { describe, expect, it } from 'vitest'
import recorderSource from './recorder.ts?raw'

/**
 * Per-seat state lives in `StreamState`; only the two call-stack counters may
 * be module-level. This reads the source so a later edit cannot quietly add
 * a `let` that would be shared by every seat again — the class of bug that
 * made the recorder single-workspace in the first place.
 */
describe('recorder module state', () => {
  const topLevelLets = [
    ...recorderSource.matchAll(/^let\s+([A-Za-z_$][\w$]*)/gm),
  ]
    .map((m) => m[1])
    .sort()
  const topLevelSignals = [
    ...recorderSource.matchAll(/^const\s+\[[^\]]*\]\s*=\s*createSignal/gm),
  ]

  it('keeps only the re-entrancy counters at module level', () => {
    expect(topLevelLets).toEqual(['commandDepth', 'suppressDepth'])
  })

  it('creates no module-level signals', () => {
    expect(topLevelSignals).toHaveLength(0)
  })
})
