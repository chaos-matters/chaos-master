import { describe, expect, it } from 'vitest'
import { guardCommand, isCommandAllowed, qualityRank } from './guard'
import { DUEL_ALLOWED } from './topics'
import type { PilotState } from './pilot'

const driving: PilotState = {
  phase: 'driving',
  mode: 'teach',
  topic: 'variations',
  title: 'Teaching: Variations',
  startedAt: 0,
  steps: 0,
  stepBudget: 30,
  allowed: ['flame.addTransform', 'camera.', 'view.', 'lesson.note'],
  seatId: 'player',
  lock: 'screen',
  qualityRankAtStart: 1,
}

describe('guardCommand', () => {
  it('does nothing when nobody is driving', () => {
    expect(guardCommand('export.png', [], { phase: 'idle' })).toBeUndefined()
  })
  it('matches exact ids and dot-prefixes', () => {
    expect(isCommandAllowed('flame.addTransform', driving.allowed)).toBe(true)
    expect(isCommandAllowed('flame.addVariation', driving.allowed)).toBe(false)
    expect(isCommandAllowed('camera.zoomTo', driving.allowed)).toBe(true)
  })
  it('blocks exports, history and disallowed commands with a readable reason', () => {
    expect(guardCommand('export.png', [], driving)).toMatch(/not available/)
    expect(guardCommand('history.undo', [], driving)).toMatch(/not available/)
    expect(guardCommand('flame.setExposure', [0.5], driving)).toMatch(
      /not allowed in teach\/variations/,
    )
  })
  it('never raises quality above the starting preset', () => {
    expect(qualityRank('mid')).toBe(1)
    expect(
      guardCommand('view.setQualityPreset', ['low'], driving),
    ).toBeUndefined()
    expect(guardCommand('view.setQualityPreset', ['high'], driving)).toMatch(
      /Quality/,
    )
    expect(
      guardCommand('view.setQualityPreset', ['nonsense'], driving),
    ).toMatch(/Quality/)
  })
  it('keeps timeline looping off while the agent drives', () => {
    const state: PilotState = { ...driving, allowed: ['timeline.'] }
    expect(guardCommand('timeline.setLoop', [true], state)).toMatch(
      /Looping playback stays off/,
    )
    expect(guardCommand('timeline.setLoop', [], state)).toMatch(
      /Looping playback stays off/,
    )
    expect(guardCommand('timeline.setLoop', [false], state)).toBeUndefined()
  })
  it('locks point count, dimensions and quality render settings', () => {
    const state: PilotState = { ...driving, allowed: ['flame.'] }
    expect(
      guardCommand('flame.setRenderSetting', ['pointCount', 10], state),
    ).toMatch(/locked/)
    expect(
      guardCommand('flame.updateRenderSettings', [{ dimensions: 3 }], state),
    ).toMatch(/locked/)
    expect(
      guardCommand('flame.setRenderSetting', ['gamma', 2], state),
    ).toBeUndefined()
  })
  it('holds a duel to flame and camera work', () => {
    const state: PilotState = {
      ...driving,
      mode: 'duel',
      topic: undefined,
      allowed: [...DUEL_ALLOWED],
    }
    expect(guardCommand('flame.setExposure', [0.4], state)).toBeUndefined()
    expect(guardCommand('camera.zoomTo', [2], state)).toBeUndefined()
    expect(guardCommand('timeline.play', [], state)).toMatch(/not allowed/)
    expect(guardCommand('view.setShowTimeline', [true], state)).toMatch(
      /not allowed/,
    )
    expect(guardCommand('history.undo', [], state)).toMatch(/not available/)
    expect(guardCommand('export.png', [], state)).toMatch(/not available/)
    // The render-setting locks still apply.
    expect(
      guardCommand('flame.setRenderSetting', ['pointCount', 10], state),
    ).toMatch(/locked/)
  })
})
