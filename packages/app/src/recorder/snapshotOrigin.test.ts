import { describe, expect, it } from 'vitest'
import { snapshotOrigin, snapshotOriginFocus, snapshotOriginForCommand, snapshotOriginLabel, tryValidateSnapshotOrigin, } from './snapshotOrigin'

describe('snapshot action origins', () => {
  it('keeps a value-pinned action human-readable and focusable', () => {
    const origin = snapshotOrigin('timeline.preset', 'Slow Orbit')

    expect(snapshotOriginLabel(origin)).toBe(
      'Apply Animation Preset: Slow Orbit',
    )
    expect(snapshotOriginFocus(origin)).toBe('ui:animation-presets')
    expect(snapshotOriginLabel(snapshotOrigin('flame.dimension', '3D'))).toBe(
      'Switch to 3D',
    )
    expect(snapshotOriginLabel(snapshotOrigin('flame.file'))).toBe('Load Flame')
  })

  it('reads append-only origin positions without changing old signatures', () => {
    const flameOrigin = snapshotOrigin('flame.evolve')
    const timelineOrigin = snapshotOrigin('timeline.smart')

    expect(
      snapshotOriginForCommand('flame.load', [
        { transforms: {} },
        'Load',
        null,
        flameOrigin,
      ]),
    ).toEqual(flameOrigin)
    expect(
      snapshotOriginForCommand('timeline.loadTimeline', [{}, timelineOrigin]),
    ).toEqual(timelineOrigin)
    expect(snapshotOriginForCommand('flame.load', [{}, 'Load'])).toBeUndefined()
  })

  it('rejects unknown, oversized, and prototype-bearing imported values', () => {
    expect(tryValidateSnapshotOrigin({ kind: 'future.action' })).toBeUndefined()
    expect(
      tryValidateSnapshotOrigin({
        kind: 'flame.file',
        detail: 'x'.repeat(161),
      }),
    ).toBeUndefined()
    expect(
      tryValidateSnapshotOrigin(
        Object.assign(Object.create({ inherited: true }), {
          kind: 'flame.file',
        }),
      ),
    ).toBeUndefined()
    expect(
      tryValidateSnapshotOrigin({ kind: 'flame.file', selector: 'body' }),
    ).toBeUndefined()
  })

  it('never accepts a caller-provided focus selector', () => {
    expect(
      tryValidateSnapshotOrigin({
        kind: 'flame.file',
        focus: 'ui:recorder-dock',
      }),
    ).toBeUndefined()
  })
})
