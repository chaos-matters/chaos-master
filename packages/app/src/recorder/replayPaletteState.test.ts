import { createStore } from 'solid-js/store'
import { describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { captureTransformColors, paletteRestoreColorsAfterReplayCommand, runPaletteRestoreTransition, } from './replayPaletteState'
import type { TransformColorSnapshot } from './replayPaletteState'

describe('replay palette restore state', () => {
  it('captures the first palette apply exactly and preserves it across palette switches', () => {
    const flame = deepClone(examples.example1)
    const expected = captureTransformColors(flame)

    let stash = paletteRestoreColorsAfterReplayCommand(
      'flame.applyPalette',
      [],
      flame,
      {},
    )
    expect(stash).toEqual(expected)

    const firstTransform = Object.values(flame.transforms)[0]!
    firstTransform.color.x += 0.25
    expect(stash).toEqual(expected)

    stash = paletteRestoreColorsAfterReplayCommand(
      'flame.applyPalette',
      [],
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
      [],
      examples.example1,
      stale,
    )
    expect(afterLoad).toEqual({})

    const seeded = paletteRestoreColorsAfterReplayCommand(
      'flame.applyPalette',
      [],
      examples.example1,
      afterLoad,
    )
    expect(seeded).toEqual(captureTransformColors(examples.example1))

    expect(
      paletteRestoreColorsAfterReplayCommand(
        'flame.removePalette',
        [],
        examples.example1,
        seeded,
      ),
    ).toEqual({})
  })

  it('restores serialized provenance for history-compressed replay actions', () => {
    const persisted = captureTransformColors(examples.example1)
    const stale: TransformColorSnapshot = {
      old_transform: { x: 0.2, y: -0.4 },
    }

    expect(
      paletteRestoreColorsAfterReplayCommand(
        'flame.load',
        [examples.example1, 'Redo', persisted],
        examples.example2,
        stale,
      ),
    ).toEqual(persisted)
    expect(
      paletteRestoreColorsAfterReplayCommand(
        'recorder.restoreWorkspaceSnapshot',
        [examples.example1, { config: {}, tracks: [] }, persisted],
        examples.example2,
        stale,
      ),
    ).toEqual(persisted)
  })

  it('keeps legacy workspace restores but clears legacy document loads', () => {
    const current = captureTransformColors(examples.example1)

    expect(
      paletteRestoreColorsAfterReplayCommand(
        'recorder.restoreWorkspaceSnapshot',
        [examples.example1, { config: {}, tracks: [] }],
        examples.example1,
        current,
      ),
    ).toBe(current)
    expect(
      paletteRestoreColorsAfterReplayCommand(
        'flame.load',
        [examples.example2, 'Load'],
        examples.example1,
        current,
      ),
    ).toEqual({})
  })

  it('moves load provenance with the replaced document through undo and redo', () => {
    const initial = deepClone(examples.example1)
    const loaded = deepClone(examples.example2)
    const [flame, setFlame, history] = createStoreHistory(
      createStore(deepClone(initial)),
    )
    let stash = captureTransformColors(initial)

    runPaletteRestoreTransition(
      history,
      stash,
      {},
      (colors) => {
        stash = colors
      },
      'Load Flame',
      () => {
        setFlame(() => deepClone(loaded), 'Load Flame')
      },
    )

    expect(deepClone(flame)).toEqual(loaded)
    expect(stash).toEqual({})

    history.undo()
    expect(deepClone(flame)).toEqual(initial)
    expect(stash).toEqual(captureTransformColors(initial))

    history.redo()
    expect(deepClone(flame)).toEqual(loaded)
    expect(stash).toEqual({})
  })

  it('moves palette apply/remove provenance through ordinary undo and redo', () => {
    const initial = deepClone(examples.example1)
    const [flame, setFlame, history] = createStoreHistory(
      createStore(deepClone(initial)),
    )
    const naturalColors = captureTransformColors(initial)
    let stash: TransformColorSnapshot = {}

    runPaletteRestoreTransition(
      history,
      stash,
      naturalColors,
      (colors) => {
        stash = colors
      },
      'Apply Palette',
      () => {
        setFlame((draft) => {
          draft.renderSettings.exposure += 0.1
        }, 'Apply Palette')
      },
    )
    expect(stash).toEqual(naturalColors)

    runPaletteRestoreTransition(
      history,
      stash,
      {},
      (colors) => {
        stash = colors
      },
      'Remove Palette',
      () => {
        setFlame((draft) => {
          draft.renderSettings.exposure += 0.1
        }, 'Remove Palette')
      },
    )
    expect(stash).toEqual({})

    history.undo()
    expect(stash).toEqual(naturalColors)

    history.undo()
    expect(stash).toEqual({})
    expect(flame.renderSettings.exposure).toBe(initial.renderSettings.exposure)

    history.redo()
    expect(stash).toEqual(naturalColors)

    history.redo()
    expect(stash).toEqual({})
    expect(flame.renderSettings.exposure).toBeCloseTo(
      initial.renderSettings.exposure + 0.2,
    )
  })
})
