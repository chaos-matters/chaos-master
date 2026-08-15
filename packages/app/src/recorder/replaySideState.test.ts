import { describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { normalizeReplayPresentation, replaySideStateChanged, } from './replaySideState'
import type { ReplayNonFlameSideState } from './replaySideState'
import type { TransformId } from '@/flame/schema/flameSchema'

const sideState = (): ReplayNonFlameSideState => ({
  timeline: {
    tracks: [],
    config: {
      fps: 30,
      timeScale: 1,
      startFrame: 0,
      endFrame: 90,
      loop: true,
      autoFps: false,
      loopMode: 'off',
    },
  },
  audio: {
    mapping: { preset: 'custom', mappings: [] },
    enabled: false,
    source: 'file',
  },
  view: {
    qualityPreset: 'medium',
    pixelRatio: 1,
    adaptiveFilter: true,
    stochasticFilter: false,
    flyMode: false,
    showTimeline: false,
    sidebarOpen: true,
  },
  presentation: {
    sidebarHidden: false,
    selectedTransformId: null,
    collapsedTransformIds: [],
    timelineCollapsed: false,
    sidebarDiffView: null,
    showBlendGallery: false,
    showAudioPanel: false,
    showSonificationPanel: false,
    quickPickState: null,
    hoveredVariationType: null,
    affineCardOpen: true,
    colorCardOpen: true,
    metadataCardOpen: false,
    paletteCardOpen: false,
    prePaletteColors: {},
    renderCardOpen: true,
    floatingActionsCollapsed: false,
    affineMode: 'preAffine',
    affineTab: 'grid',
    colorView: 'grid',
  },
})

describe('replay side-state snapshots', () => {
  it('restores only transform presentation that belongs to the restored flame', () => {
    const validId = Object.keys(examples.example1.transforms)[0]!
    const validVariationId = Object.keys(
      examples.example1.transforms[validId as TransformId]!.variations,
    )[0]!
    const restored = normalizeReplayPresentation(
      {
        ...sideState().presentation,
        selectedTransformId: 'deleted-transform',
        collapsedTransformIds: [
          'deleted-transform',
          validId,
          validId,
          '_sym__generated',
        ],
        quickPickState: {
          tid: validId,
          vid: validVariationId,
          type: 'linear',
        },
        hoveredVariationType: 'swirl',
      },
      examples.example1,
    )

    expect(restored.selectedTransformId).toBeNull()
    expect(restored.collapsedTransformIds).toEqual([validId])
    expect(restored.quickPickState).toEqual({
      tid: validId,
      vid: validVariationId,
      type: 'linear',
    })
    expect(restored.hoveredVariationType).toBe('swirl')
  })

  it('drops picker state whose exact transform or variation no longer exists', () => {
    const restored = normalizeReplayPresentation(
      {
        ...sideState().presentation,
        quickPickState: {
          tid: Object.keys(examples.example1.transforms)[0]!,
          vid: 'deleted-variation',
          type: 'linear',
        },
        hoveredVariationType: 'swirl',
      },
      examples.example1,
    )

    expect(restored.quickPickState).toBeNull()
    expect(restored.hoveredVariationType).toBeNull()
  })

  it('does not retain side-effect snapshots for a flame-only replay', () => {
    const before = { ...sideState(), flame: examples.example1 }
    const after = { ...sideState(), flame: examples.example2 }

    expect(replaySideStateChanged(before, after)).toBe(false)
  })

  it('retains side effects when timeline silent-write state changed', () => {
    const before = sideState()
    const after = {
      ...sideState(),
      timeline: { ...sideState().timeline, currentFrame: 12 },
    }

    expect(replaySideStateChanged(before, after)).toBe(true)
  })

  it('retains follow-cam timeline expansion so Undo can restore collapse', () => {
    const before = sideState()
    before.presentation.timelineCollapsed = true

    expect(replaySideStateChanged(before, sideState())).toBe(true)
  })

  it('retains palette restore colours so replay Undo and Redo restore the stash', () => {
    const after = sideState()
    after.presentation.prePaletteColors = {
      transform1: { x: 0.125, y: -0.375 },
    }

    expect(replaySideStateChanged(sideState(), after)).toBe(true)
  })
})
