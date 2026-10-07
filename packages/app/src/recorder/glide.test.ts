import { describe, expect, it } from 'vitest'
import { GLIDE_DURATIONS } from '@/flame/glide/durations'
import { MAX_GLIDE_MS } from '@/flame/glide/types'
import { DEFAULT_REPLAY_GLIDE_MS, glideMsForAction, glideOptionsByStep, } from './glide'
import { MIN_STEP_GAP_MS, stepGapMs } from './player'
import type { ReplayGlideOptions } from './glide'
import type { RecordedAction, SessionViewSnapshot } from './schema'

const ON = { enabled: true } as const

function action(extra: Partial<RecordedAction> = {}): RecordedAction {
  return { t: 0, id: 'flame.setGamma', args: [2], ...extra }
}

describe('glideMsForAction', () => {
  it('is zero with the feature off, whatever the step says', () => {
    expect(
      glideMsForAction(action({ glideMs: 900, glide: 'whole' }), {
        enabled: false,
      }),
    ).toBe(0)
  })

  it('lets an authored duration win, including zero', () => {
    expect(glideMsForAction(action({ glideMs: 1234 }), ON)).toBe(1234)
    expect(glideMsForAction(action({ glideMs: 0, glide: 'whole' }), ON)).toBe(0)
  })

  it('clamps an authored duration to the ceiling', () => {
    expect(glideMsForAction(action({ glideMs: 99_999 }), ON)).toBe(MAX_GLIDE_MS)
  })

  it('resolves a semantic hint against the duration table', () => {
    expect(glideMsForAction(action({ glide: 'transform' }), ON)).toBe(
      GLIDE_DURATIONS.transform,
    )
    expect(glideMsForAction(action({ glide: 'whole' }), ON)).toBe(
      GLIDE_DURATIONS.whole,
    )
    // `cut` is how a synthesized session says "this one snaps" — a palette
    // apply, or clearing the canvas.
    expect(glideMsForAction(action({ glide: 'cut' }), ON)).toBe(0)
  })

  it('falls back to the default for a step that says nothing', () => {
    expect(glideMsForAction(action(), ON)).toBe(DEFAULT_REPLAY_GLIDE_MS)
    expect(glideMsForAction(action(), { enabled: true, defaultMs: 250 })).toBe(
      250,
    )
  })

  it('scales with the quality tier', () => {
    expect(
      glideMsForAction(action({ glide: 'transform' }), {
        enabled: true,
        durationScale: 1.5,
      }),
    ).toBe(GLIDE_DURATIONS.transform * 1.5)
  })

  it('is zero for no step at all', () => {
    expect(glideMsForAction(undefined, ON)).toBe(0)
  })
})

describe('stepGapMs with a glide', () => {
  const previous: RecordedAction = { t: 0, id: 'flame.setGamma', args: [2] }
  const next: RecordedAction = { t: 1500, id: 'flame.setGamma', args: [3] }

  it('spends the glide inside the dwell rather than on top of it', () => {
    const plain = stepGapMs(previous, next, 1)
    expect(stepGapMs(previous, next, 1, 400)).toBe(plain - 400)
  })

  it('never lets a glide push a gap below the floor', () => {
    const plain = stepGapMs(previous, next, 1)
    expect(plain).toBeGreaterThanOrEqual(MIN_STEP_GAP_MS)
    expect(stepGapMs(previous, next, 1, 5000)).toBe(MIN_STEP_GAP_MS)
  })

  it('never makes a take longer', () => {
    for (const glideMs of [0, 100, 400, 900, 5000]) {
      expect(stepGapMs(previous, next, 1, glideMs)).toBeLessThanOrEqual(
        stepGapMs(previous, next, 1),
      )
    }
  })

  it('leaves an authored hold of zero at zero', () => {
    const authored: RecordedAction = {
      t: 0,
      id: 'flame.setGamma',
      args: [2],
      holdMs: 0,
    }
    expect(stepGapMs(authored, next, 1)).toBe(0)
    expect(stepGapMs(authored, next, 1, 400)).toBe(0)
  })

  it('is unchanged when no glide is asked for', () => {
    expect(stepGapMs(previous, next, 1, 0)).toBe(stepGapMs(previous, next, 1))
    expect(stepGapMs(undefined, next, 1, 0)).toBe(stepGapMs(undefined, next, 1))
  })
})

describe('glideOptionsByStep', () => {
  const steps = (...actions: [string, unknown][]) =>
    actions.map(([id, value], t) => ({ t, id, args: [value] }))
  const tiers = (
    session: Parameters<typeof glideOptionsByStep>[0],
    glide: ReplayGlideOptions,
  ) => glideOptionsByStep(session, glide).map((options) => options.tier)

  it("starts from the viewer's switch and follows the take's", () => {
    const actions = steps(
      ['flame.setGamma', 2],
      ['glide.setQuality', 'full'],
      ['glide.setQuality', 'bogus'],
      ['glide.setEnabled', false],
    )
    expect(tiers({ actions }, { ...ON, preference: 'balanced' })).toEqual([
      'balanced',
      'full',
      'full',
      'full',
    ])
  })

  it("reads `auto` from the take's preset, and the viewer's with none", () => {
    const actions = steps(
      ['flame.setGamma', 2],
      ['view.setQualityPreset', 'ultra'],
    )
    const viewer = { ...ON, preference: 'auto', tier: 'balanced' } as const
    expect(tiers({ actions }, viewer)).toEqual(['balanced', 'full'])
    const initialView = { qualityPreset: 'low' } as SessionViewSnapshot
    expect(tiers({ actions, initialView }, viewer)).toEqual([
      'responsive',
      'full',
    ])
    // A preset the workspace does not know is one the replay never loads.
    const unknown = { qualityPreset: 'bogus' } as SessionViewSnapshot
    expect(tiers({ actions, initialView: unknown }, viewer)).toEqual([
      'balanced',
      'full',
    ])
  })

  it('holds an export queued before the preference was sent to its tier', () => {
    const actions = steps(['flame.setGamma', 2], ['glide.setQuality', 'auto'])
    const legacy = { ...ON, tier: 'full', durationScale: 1.5 } as const
    expect(glideOptionsByStep({ actions }, legacy)).toMatchObject([
      { tier: 'full', durationScale: 1.5 },
      { tier: 'full', durationScale: 1.5 },
    ])
  })
})
