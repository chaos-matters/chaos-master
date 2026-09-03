import { describe, expect, it } from 'vitest'
import { deriveReplayFocusPreparation } from './focusPreparation'
import { snapshotOrigin } from './snapshotOrigin'
import type { RecordedAction } from './schema'

const action = (
  id: string,
  args: unknown[],
  focus?: string,
): RecordedAction => ({ t: 0, id, args, focus })

const editorSidebar = {
  show: true,
  unhide: true,
  showEditor: true,
} as const

describe('deriveReplayFocusPreparation', () => {
  it('reveals, selects, and expands the exact variation owner', () => {
    expect(
      deriveReplayFocusPreparation(
        action(
          'flame.setVariation',
          ['t3', 'v1', { type: 'linear' }],
          'focus:tx:t3:variation:v1:type',
        ),
      ),
    ).toEqual({
      spotlightFocus: 'focus:tx:t3:variation:v1:type',
      sidebar: editorSidebar,
      transform: { id: 't3', select: true, expand: true },
    })
  })

  it('upgrades a legacy generic variation hint from the command arguments', () => {
    expect(
      deriveReplayFocusPreparation(
        action(
          'flame.setVariationVisible',
          ['t8', 'v2', false],
          'ui:variation-type',
        ),
      ),
    ).toEqual({
      spotlightFocus: 'focus:tx:t8:variation:v2:visibility',
      sidebar: editorSidebar,
      transform: { id: 't8', select: true, expand: true },
    })
  })

  it('trusts the replay command ids over a stale exact hint', () => {
    expect(
      deriveReplayFocusPreparation(
        action(
          'flame.setVariation',
          ['t3', 'v1', { type: 'linear' }],
          'focus:tx:t1:variation:v1:type',
        ),
      ),
    ).toMatchObject({
      spotlightFocus: 'focus:tx:t3:variation:v1:type',
      transform: { id: 't3' },
    })
  })

  it('parses a variation parameter path without losing entity identity', () => {
    expect(
      deriveReplayFocusPreparation(
        action(
          'some.futureCommand',
          [],
          'param:transform_two.variation_nine.power',
        ),
      ),
    ).toEqual({
      spotlightFocus: 'param:transform_two.variation_nine.power',
      sidebar: editorSidebar,
      transform: { id: 'transform_two', select: true, expand: true },
    })
  })

  it.each([
    ['pre', 'preAffine'],
    ['post', 'postAffine'],
  ] as const)(
    'uses the %s affine command mode before spotlighting its handle',
    (commandMode, expectedMode) => {
      expect(
        deriveReplayFocusPreparation(
          action(
            'flame.setTransformAffine',
            ['t4', commandMode, { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }],
            'focus:tx:t4:affine',
          ),
        ),
      ).toEqual({
        spotlightFocus: 'focus:tx:t4:affine',
        sidebar: editorSidebar,
        transform: { id: 't4', select: true, expand: true },
        affineMode: expectedMode,
        affineTab: 'grid',
        editorSurface: 'affine',
      })
    },
  )

  it('opens scalar affine coefficients in the list editor', () => {
    expect(
      deriveReplayFocusPreparation(
        action('flame.setAffine', ['t7', 'post', 'e', 0.5]),
      ),
    ).toEqual({
      spotlightFocus: 'param:transform.t7.postAffine.e',
      sidebar: editorSidebar,
      transform: { id: 't7', select: true, expand: true },
      affineMode: 'postAffine',
      affineTab: 'list',
      editorSurface: 'affine',
    })
  })

  it('keeps affine dice and reset actions on their exact list buttons', () => {
    expect(
      deriveReplayFocusPreparation(
        action('flame.setTransformAffine', [
          't7',
          'pre',
          { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          'randomize',
        ]),
      ),
    ).toEqual({
      spotlightFocus: 'focus:tx:t7:affine:randomize',
      sidebar: editorSidebar,
      transform: { id: 't7', select: true, expand: true },
      affineMode: 'preAffine',
      affineTab: 'list',
      editorSurface: 'affine',
    })
  })

  it.each([
    ['preAffine', 'preAffine'],
    ['postAffine', 'postAffine'],
  ] as const)(
    'derives %s from an affine parameter path',
    (pathMode, expectedMode) => {
      expect(
        deriveReplayFocusPreparation(
          action('some.futureCommand', [], `param:transform.t7.${pathMode}.e`),
        ),
      ).toEqual({
        spotlightFocus: `param:transform.t7.${pathMode}.e`,
        sidebar: editorSidebar,
        transform: { id: 't7', select: true, expand: true },
        affineMode: expectedMode,
        editorSurface: 'affine',
      })
    },
  )

  it('switches the affine editor to its final-transform mode', () => {
    expect(
      deriveReplayFocusPreparation(
        action('flame.setFinalTransform', [{}], 'focus:affine:final'),
      ),
    ).toEqual({
      spotlightFocus: 'focus:affine:final',
      sidebar: editorSidebar,
      affineMode: 'final',
      affineTab: 'grid',
      editorSurface: 'affine',
    })
  })

  it('opens a scalar final-transform coefficient in the list editor', () => {
    expect(
      deriveReplayFocusPreparation(action('flame.setFinalAffine', ['e', 0.5])),
    ).toEqual({
      spotlightFocus: 'param:finalTransform.e',
      sidebar: editorSidebar,
      affineMode: 'final',
      affineTab: 'list',
      editorSurface: 'affine',
    })
  })

  it('keeps final-transform randomize on the list button', () => {
    expect(
      deriveReplayFocusPreparation(
        action('flame.setFinalTransform', [
          { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          'randomize',
        ]),
      ),
    ).toEqual({
      spotlightFocus: 'focus:affine:final:randomize',
      sidebar: editorSidebar,
      affineMode: 'final',
      affineTab: 'list',
      editorSurface: 'affine',
    })
  })

  it('reveals the color editor for the exact transform color handle', () => {
    expect(
      deriveReplayFocusPreparation(
        action('flame.setTransformColor', ['t3', 0.1, -0.2]),
      ),
    ).toEqual({
      spotlightFocus: 'focus:tx:t3:color',
      sidebar: editorSidebar,
      transform: { id: 't3', select: true, expand: true },
      editorSurface: 'color',
      colorView: 'grid',
    })
  })

  it('opens exact color components and list actions in the list editor', () => {
    expect(
      deriveReplayFocusPreparation(
        action('flame.setTransformColor', ['t3', 0.1, -0.2, 'card-randomize']),
      ),
    ).toEqual({
      spotlightFocus: 'focus:tx:t3:header-color-randomize',
      sidebar: editorSidebar,
      transform: { id: 't3', select: true, expand: true },
    })
    expect(
      deriveReplayFocusPreparation(
        action('flame.setTransformColor', ['t3', 0.1, -0.2, 'x']),
      ),
    ).toEqual({
      spotlightFocus: 'param:transform.t3.color.x',
      sidebar: editorSidebar,
      transform: { id: 't3', select: true, expand: true },
      editorSurface: 'color',
      colorView: 'list',
    })
    expect(
      deriveReplayFocusPreparation(
        action('flame.setTransformColor', ['t3', 0.1, -0.2, 'randomize']),
      ),
    ).toMatchObject({
      spotlightFocus: 'focus:tx:t3:color:randomize',
      colorView: 'list',
    })
  })

  it('reveals the timeline for authored timeline controls', () => {
    expect(
      deriveReplayFocusPreparation(
        action('timeline.setFps', [30], 'ui:timeline-section'),
      ),
    ).toEqual({
      spotlightFocus: 'ui:timeline-fps',
      timeline: { show: true },
    })
  })

  it('expands the exact dope-sheet target for a keyframe action', () => {
    expect(
      deriveReplayFocusPreparation(
        action('timeline.setKeyframeValue', ['gamma', 12, 2.4]),
      ),
    ).toEqual({
      spotlightFocus: 'ui:dope-sheet',
      timeline: { show: true, expand: true },
    })
  })

  it('expands floating actions before resolving its quality target', () => {
    expect(
      deriveReplayFocusPreparation(
        action('view.setQualityPreset', ['high'], 'ui:quality-presets'),
      ),
    ).toEqual({
      spotlightFocus: 'ui:quality-presets',
      floatingActions: { expand: true },
    })
  })

  it('opens the randomizer for an exact value-pinned generator action', () => {
    expect(
      deriveReplayFocusPreparation(
        action('flame.load', [
          {},
          'Randomize Flame',
          {},
          snapshotOrigin('flame.randomize'),
        ]),
      ),
    ).toEqual({
      spotlightFocus: 'ui:randomizer-generate',
      sidebar: editorSidebar,
      editorSurface: 'randomizer',
    })
  })

  it('reveals exact timeline settings and generator controls', () => {
    expect(
      deriveReplayFocusPreparation(action('timeline.setFps', [30])),
    ).toEqual({
      spotlightFocus: 'ui:timeline-fps',
      timeline: { show: true },
    })
    expect(
      deriveReplayFocusPreparation(
        action('timeline.loadTimeline', [
          {},
          snapshotOrigin('timeline.colors'),
        ]),
      ),
    ).toEqual({
      spotlightFocus: 'ui:animation-colors',
      timeline: { show: true },
    })
  })

  it('expands floating actions for exact viewport toggles', () => {
    expect(
      deriveReplayFocusPreparation(action('view.setStochasticFilter', [true])),
    ).toEqual({
      spotlightFocus: 'ui:stochastic-filter',
      floatingActions: { expand: true },
    })
    expect(
      deriveReplayFocusPreparation(action('view.setShowTimeline', [false])),
    ).toEqual({
      spotlightFocus: 'ui:show-timeline',
      floatingActions: { expand: true },
    })
  })

  it('selects and expands a transform before spotlighting visibility', () => {
    expect(
      deriveReplayFocusPreparation(
        action('flame.setTransformVisible', ['t3', false]),
      ),
    ).toEqual({
      spotlightFocus: 'focus:tx:t3:visibility',
      sidebar: editorSidebar,
      transform: { id: 't3', select: true, expand: true },
    })
  })

  it('reveals the sidebar before focusing exact symmetry controls', () => {
    expect(
      deriveReplayFocusPreparation(
        action('flame.applySymmetry', [
          2,
          'rotational',
          [['_sym__t1', 'v1']],
          'folds',
        ]),
      ),
    ).toEqual({
      spotlightFocus: 'ui:symmetry-folds',
      sidebar: editorSidebar,
      symmetryCard: { expand: true },
    })
  })

  it('opens the dedicated symmetry row instead of the ordinary transform editor', () => {
    expect(
      deriveReplayFocusPreparation(
        action('flame.setTransformAffine', [
          '_sym__t3',
          'pre',
          { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        ]),
      ),
    ).toEqual({
      spotlightFocus: 'focus:tx:_sym__t3:affine',
      sidebar: editorSidebar,
      symmetryCard: { expand: true },
    })

    expect(
      deriveReplayFocusPreparation(
        action('flame.setTransformVisible', ['_sym__t3', false]),
      ),
    ).toEqual({
      spotlightFocus: 'focus:tx:_sym__t3:visibility',
      sidebar: editorSidebar,
      symmetryCard: { expand: true },
    })

    expect(
      deriveReplayFocusPreparation(
        action('flame.removeTransform', ['_sym__t3']),
      ),
    ).toEqual({
      spotlightFocus: 'ui:symmetry-card',
      sidebar: editorSidebar,
      clearTransformSelection: true,
      symmetryCard: { expand: true },
    })
  })

  it('reveals the audio panel for resource-safe audio wiring actions', () => {
    expect(
      deriveReplayFocusPreparation(action('audio.applySnapshot', [])),
    ).toEqual({
      spotlightFocus: 'ui:audio-panel',
      sidebar: editorSidebar,
      audioPanel: { show: true },
    })
  })

  it('reveals the sonification panel and its exact authored control', () => {
    expect(
      deriveReplayFocusPreparation(
        action('sonification.setConfig', [{}, 'harmonicDensity']),
      ),
    ).toEqual({
      spotlightFocus: 'param:sonification.harmonicDensity',
      sidebar: editorSidebar,
      sonificationPanel: { show: true },
    })
  })

  it('opens the Render card before resolving a render-setting control', () => {
    expect(
      deriveReplayFocusPreparation(
        action('flame.setRenderSetting', ['gamma', 2.4]),
      ),
    ).toEqual({
      spotlightFocus: 'param:gamma',
      sidebar: editorSidebar,
      editorSurface: 'render',
    })
  })

  it('targets the exact auto-exposure control for compound render edits', () => {
    expect(
      deriveReplayFocusPreparation(
        action('flame.updateRenderSettings', [
          {
            autoExposure3D: true,
            autoExposure3DBase: 1,
            autoExposure3DRefRadius: 5,
          },
          'render',
        ]),
      ),
    ).toEqual({
      spotlightFocus: 'param:autoExposure3D',
      sidebar: editorSidebar,
      editorSurface: 'render',
    })

    expect(
      deriveReplayFocusPreparation(
        action('flame.updateRenderSettings', [
          { exposure: 2, autoExposure3DBase: 2 },
          'render',
        ]),
      ),
    ).toEqual({
      spotlightFocus: 'param:exposure',
      sidebar: editorSidebar,
      editorSurface: 'render',
    })
  })

  it('keeps randomizer render edits focused on their authored surface', () => {
    expect(
      deriveReplayFocusPreparation(
        action('flame.updateRenderSettings', [{ gamma: 2.4 }, 'randomizer']),
      ),
    ).toEqual({
      spotlightFocus: 'ui:randomizer-card',
      sidebar: editorSidebar,
      editorSurface: 'randomizer',
    })
  })

  it('opens the Palette card for palette apply/remove actions', () => {
    expect(
      deriveReplayFocusPreparation(action('flame.applyPalette', [{}])),
    ).toEqual({
      spotlightFocus: 'ui:palette-selector',
      sidebar: editorSidebar,
      editorSurface: 'palette',
    })
    expect(
      deriveReplayFocusPreparation(action('flame.removePalette', [{}])),
    ).toEqual({
      spotlightFocus: 'ui:palette-selector',
      sidebar: editorSidebar,
      editorSurface: 'palette',
    })
  })

  it('opens Metadata and targets an exact edited field when available', () => {
    expect(
      deriveReplayFocusPreparation(
        action('flame.setMetadata', ['author', 'Grace']),
      ),
    ).toEqual({
      spotlightFocus: 'param:metadata.author',
      sidebar: editorSidebar,
      editorSurface: 'metadata',
    })
    expect(
      deriveReplayFocusPreparation(
        action('flame.setMetadata', [{ name: 'One', author: 'Two' }]),
      ),
    ).toEqual({
      spotlightFocus: 'ui:metadata-card',
      sidebar: editorSidebar,
      editorSurface: 'metadata',
    })
  })

  it('expands floating actions for the color randomizer action', () => {
    expect(
      deriveReplayFocusPreparation(action('flame.setAllTransformColors', [{}])),
    ).toEqual({
      spotlightFocus: 'ui:randomize-colors',
      floatingActions: { expand: true },
    })
  })

  it('does not mistake a camera setting path for transform/variation ids', () => {
    expect(
      deriveReplayFocusPreparation(
        action(
          'flame.setRenderSetting',
          ['camera.zoom', 1.5],
          'param:camera.zoom',
        ),
      ),
    ).toEqual({ spotlightFocus: 'param:camera.zoom' })
  })

  it('falls back to the surviving transform after deleting a variation', () => {
    expect(
      deriveReplayFocusPreparation(
        action(
          'flame.deleteVariation',
          ['t3', 'v1'],
          'focus:tx:t3:variation:v1:type',
        ),
      ),
    ).toEqual({
      spotlightFocus: 'focus:tx:t3',
      sidebar: editorSidebar,
      transform: { id: 't3', select: true, expand: true },
    })
  })

  it.each(['flame.deleteTransform', 'flame.removeTransform'])(
    'falls back to the transform list after %s removes its target',
    (id) => {
      expect(
        deriveReplayFocusPreparation(action(id, ['t3'], 'focus:tx:t3')),
      ).toEqual({
        spotlightFocus: 'ui:transform-list',
        sidebar: editorSidebar,
        clearTransformSelection: true,
      })
    },
  )

  it('does not turn an unsafe imported id into workspace state', () => {
    expect(
      deriveReplayFocusPreparation(
        action('some.futureCommand', [], 'focus:tx:unsafe-id:affine'),
      ),
    ).toEqual({ spotlightFocus: 'focus:tx:unsafe-id:affine' })
  })

  it('leaves unrelated canvas focus alone', () => {
    // A command this build does not recognise keeps whatever the file says.
    expect(
      deriveReplayFocusPreparation(
        action('some.futureCommand', [], 'ui:canvas'),
      ),
    ).toEqual({ spotlightFocus: 'ui:canvas' })
  })

  it('re-derives a camera step recorded before the anchors existed', () => {
    // Camera steps used to record `ui:canvas`, which spotlights the one region
    // follow-cam never dims — so those sessions highlighted nothing. Deriving
    // at replay time is exactly what fixes an old file in place.
    expect(
      deriveReplayFocusPreparation(action('camera.center', [], 'ui:canvas')),
    ).toEqual({ spotlightFocus: 'param:camera.zoom' })
  })
})
