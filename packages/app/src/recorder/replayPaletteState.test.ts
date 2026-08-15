import { describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { captureTransformColors, paletteRestoreColorsAfterReplayCommand, } from './replayPaletteState'
import type { TransformColorSnapshot } from './replayPaletteState'

describe('replay palette restore state', () => {
  it('captures the first palette apply exactly and preserves it across palette switches', () => {
    const flame = deepClone(examples.example1)
    const expected = captureTransformColors(flame)

    let stash = paletteRestoreColorsAfterReplayCommand(
      'flame.applyPalette',
      flame,
      {},
    )
    expect(stash).toEqual(expected)

    const firstTransform = Object.values(flame.transforms)[0]!
    firstTransform.color.x += 0.25
    expect(stash).toEqual(expected)

    stash = paletteRestoreColorsAfterReplayCommand(
      'flame.applyPalette',
      flame,
      stash,
    )
    expect(stash).toEqual(expected)
  })

  it('clears stale colours at load and remove boundaries', () => {
    const stale: TransformColorSnapshot = {
      'transform-from-another-flame': { x: 0.2, y: -0.4 },
    }

    const afterLoad = paletteRestoreColorsAfterReplayCommand(
      'flame.load',
      examples.example1,
      stale,
    )
    expect(afterLoad).toEqual({})

    const seeded = paletteRestoreColorsAfterReplayCommand(
      'flame.applyPalette',
      examples.example1,
      afterLoad,
    )
    expect(seeded).toEqual(captureTransformColors(examples.example1))

    expect(
      paletteRestoreColorsAfterReplayCommand(
        'flame.removePalette',
        examples.example1,
        seeded,
      ),
    ).toEqual({})
  })
})
