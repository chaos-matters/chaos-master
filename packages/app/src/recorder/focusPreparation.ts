import { isSafeFlameEntityId } from '@/flame/schema/flameSchema'
import { focusHintFor } from './focus'
import { FINAL_AFFINE_FOCUS_ID } from './focusIds'
import type { RecordedAction } from './schema'

export type ReplayAffineMode = 'preAffine' | 'postAffine' | 'final'
export type ReplayAffineTab = 'grid' | 'list'
export type ReplayEditorSurface =
  | 'affine'
  | 'color'
  | 'metadata'
  | 'palette'
  | 'randomizer'
  | 'render'
export type ReplayColorView = 'grid' | 'list'

/**
 * UI state that must be ready before the follow-cam resolves an action's DOM
 * target. It deliberately describes intent rather than Solid signals, which
 * keeps replay parsing testable and lets the workspace remain the sole owner
 * of its sidebar/selection state.
 */
export type ReplayFocusPreparation = {
  /** The exact hint the spotlight should resolve after preparation. */
  spotlightFocus: string | undefined
  /** Reveal the normal editor sidebar, including its mobile-hidden state. */
  sidebar?: {
    show: true
    unhide: true
    showEditor: true
  }
  /** Select and expand the owning transform before resolving nested controls. */
  transform?: {
    id: string
    select: true
    expand: true
  }
  /** A removed transform must not remain selected after its command runs. */
  clearTransformSelection?: true
  /** Switch the affine editor to the surface that owns the target. */
  affineMode?: ReplayAffineMode
  /** Scalar coefficients live in List; draggable matrices live in Grid. */
  affineTab?: ReplayAffineTab
  /** Expand an editor card whose contents otherwise unmount while closed. */
  editorSurface?: ReplayEditorSurface
  /** Expand the dedicated symmetry card for generated `_sym__` rows. */
  symmetryCard?: { expand: true }
  /** Color handles live in Grid; component scrubs and actions live in List. */
  colorView?: ReplayColorView
  /** Reveal timeline controls before a timeline authoring action runs. */
  timeline?: { show: true; expand?: true }
  /** Reveal the audio wiring panel for audio actions. */
  audioPanel?: { show: true }
  /** Reveal the generated-audio panel for sonification actions. */
  sonificationPanel?: { show: true }
  /** Expand the floating actions instrument before resolving its controls. */
  floatingActions?: { expand: true }
}

/** A small seam for the player/UI bridge: calculate here, apply in the
 * workspace immediately before executing the action. */
export type ReplayFocusPreparationHandler = (
  preparation: ReplayFocusPreparation,
) => void

type FocusTarget = {
  focus: string
  kind:
    | 'sidebar'
    | 'transform-list'
    | 'transform'
    | 'variation'
    | 'affine'
    | 'timeline'
    | 'audio'
    | 'sonification'
    | 'floating-actions'
  transformId?: string
  variationId?: string
  affineMode?: ReplayAffineMode
  editorSurface?: ReplayEditorSurface
}

const EDITOR_SIDEBAR = {
  show: true,
  unhide: true,
  showEditor: true,
} as const

const SIDEBAR_UI_TARGETS = new Set([
  'add-symmetry',
  'affine-editor',
  'backgroundColor-picker',
  'metadata-card',
  'palette-selector',
  'randomizer-card',
  'symmetry-card',
  'symmetry-folds',
  'symmetry-type',
  'transform-list',
  'variation-type',
  'variation-weight',
])

const TIMELINE_UI_TARGETS = new Set([
  'animation-clear',
  'animation-colors',
  'animation-presets',
  'auto-keyframe',
  'dope-sheet',
  'play-button',
  'seek-ruler',
  'timeline-auto-fps',
  'timeline-duration',
  'timeline-fps',
  'timeline-loop',
  'timeline-loop-mode',
  'timeline-section',
  'timeline-speed',
])

const COLLAPSE_HIDDEN_TIMELINE_FOCUS = new Set([
  'ui:dope-sheet',
  'ui:seek-ruler',
])

const FLOATING_ACTION_UI_TARGETS = new Set([
  'adaptive-filter',
  'animation-toggle',
  'dimension-toggle',
  'export-png',
  'fly-mode',
  'load-flame',
  'new-flame',
  'quality-presets',
  'randomize-colors',
  'show-timeline',
  'stochastic-filter',
])

const RANDOMIZER_UI_TARGETS = new Set([
  'randomizer-card',
  'randomizer-generate',
  'randomizer-mutate',
  'random-animation',
  'smart-animation',
])

const REMOVES_TRANSFORM_TARGET = new Set([
  'flame.deleteTransform',
  'flame.removeTransform',
  'flame.clearTransforms',
])

function affineTarget(
  transformId: string | undefined,
  affineMode: ReplayAffineMode | undefined,
  focus: string,
): FocusTarget {
  return {
    kind: 'affine',
    transformId,
    affineMode,
    focus,
    editorSurface: 'affine',
  }
}

function targetFromFocusHint(
  hint: string | undefined,
): FocusTarget | undefined {
  if (hint === undefined) return undefined

  if (
    hint === `focus:${FINAL_AFFINE_FOCUS_ID}` ||
    hint.startsWith(`focus:${FINAL_AFFINE_FOCUS_ID}:`)
  ) {
    return affineTarget(undefined, 'final', hint)
  }

  if (hint.startsWith('focus:')) {
    const parts = hint.slice('focus:'.length).split(':')
    if (parts[0] !== 'tx' || !isSafeFlameEntityId(parts[1])) {
      return undefined
    }
    const transformId = parts[1]
    if (parts.length === 2) {
      return { kind: 'transform', transformId, focus: hint }
    }
    if (parts.length >= 3 && parts[2] === 'visibility') {
      return { kind: 'transform', transformId, focus: hint }
    }
    if (parts.length >= 3 && parts[2] === 'header-color-randomize') {
      return { kind: 'transform', transformId, focus: hint }
    }
    if (parts.length >= 3 && parts[2] === 'affine') {
      return affineTarget(transformId, undefined, hint)
    }
    if (parts.length >= 3 && parts[2] === 'color') {
      return {
        kind: 'transform',
        transformId,
        focus: hint,
        editorSurface: 'color',
      }
    }
    if (
      parts.length >= 4 &&
      parts[2] === 'variation' &&
      isSafeFlameEntityId(parts[3])
    ) {
      return {
        kind: 'variation',
        transformId,
        variationId: parts[3],
        focus: hint,
      }
    }
    return undefined
  }

  if (hint.startsWith('param:')) {
    const path = hint.slice('param:'.length)
    const parts = path.split('.')
    // These are view-control paths, not the otherwise identical
    // `<transform>.<variation>` parameter grammar.
    if (parts[0] === 'camera' || parts[0] === 'camera3D') return undefined
    if (parts[0] === 'metadata') {
      return {
        kind: 'sidebar',
        focus: hint,
        editorSurface: 'metadata',
      }
    }
    if (parts[0] === 'sonification') {
      return { kind: 'sonification', focus: hint }
    }
    if (parts[0] === 'finalTransform') {
      return affineTarget(undefined, 'final', hint)
    }
    if (parts[0] === 'transform' && isSafeFlameEntityId(parts[1])) {
      const transformId = parts[1]
      if (parts[2] === 'preAffine' || parts[2] === 'postAffine') {
        return affineTarget(transformId, parts[2], hint)
      }
      if (parts[2] === 'color') {
        return {
          kind: 'transform',
          transformId,
          focus: hint,
          editorSurface: 'color',
        }
      }
      return { kind: 'transform', transformId, focus: hint }
    }
    if (
      parts.length >= 2 &&
      isSafeFlameEntityId(parts[0]) &&
      isSafeFlameEntityId(parts[1])
    ) {
      return {
        kind: 'variation',
        transformId: parts[0],
        variationId: parts[1],
        focus: hint,
      }
    }
    // Render-setting parameters are editor-sidebar controls even when they do
    // not carry a transform identity.
    return { kind: 'sidebar', focus: hint }
  }

  if (hint.startsWith('ui:')) {
    const target = hint.slice('ui:'.length)
    if (target === 'transform-list') {
      return { kind: 'transform-list', focus: hint }
    }
    if (target === 'affine-editor') {
      return {
        kind: 'affine',
        focus: hint,
        editorSurface: 'affine',
      }
    }
    if (target === 'audio-panel') {
      return { kind: 'audio', focus: hint }
    }
    if (target === 'sonification-panel') {
      return { kind: 'sonification', focus: hint }
    }
    if (target === 'palette-selector') {
      return {
        kind: 'sidebar',
        focus: hint,
        editorSurface: 'palette',
      }
    }
    if (RANDOMIZER_UI_TARGETS.has(target)) {
      return {
        kind: 'sidebar',
        focus: hint,
        editorSurface: 'randomizer',
      }
    }
    if (FLOATING_ACTION_UI_TARGETS.has(target)) {
      return { kind: 'floating-actions', focus: hint }
    }
    if (SIDEBAR_UI_TARGETS.has(target)) {
      return { kind: 'sidebar', focus: hint }
    }
    if (TIMELINE_UI_TARGETS.has(target)) {
      return { kind: 'timeline', focus: hint }
    }
  }

  return undefined
}

function affineModeFromAction(
  action: RecordedAction,
): ReplayAffineMode | undefined {
  if (action.id === 'flame.setFinalAffine') return 'final'
  if (
    action.id !== 'flame.setAffine' &&
    action.id !== 'flame.setTransformAffine'
  ) {
    return undefined
  }
  if (action.args[1] === 'pre') return 'preAffine'
  if (action.args[1] === 'post') return 'postAffine'
  return undefined
}

function affineTabFromAction(
  action: RecordedAction,
): ReplayAffineTab | undefined {
  if (action.id === 'flame.setAffine' || action.id === 'flame.setFinalAffine') {
    return 'list'
  }
  if (action.id === 'flame.setTransformAffine') {
    return action.args[3] === 'randomize' || action.args[3] === 'reset'
      ? 'list'
      : 'grid'
  }
  if (action.id === 'flame.setFinalTransform') {
    return action.args[1] === 'randomize' ? 'list' : 'grid'
  }
  return undefined
}

function colorViewFromAction(
  action: RecordedAction,
): ReplayColorView | undefined {
  if (action.id !== 'flame.setTransformColor') return undefined
  if (action.args[3] === 'card-randomize') return undefined
  return action.args[3] === 'x' ||
    action.args[3] === 'y' ||
    action.args[3] === 'randomize' ||
    action.args[3] === 'reset'
    ? 'list'
    : 'grid'
}

/**
 * Derive the UI preparation needed for a replay step. The central command
 * focus vocabulary wins over the focus saved in an older session, upgrading
 * generic/stale hints without maintaining a second command-to-focus table.
 * Unknown or malformed hints are retained for the spotlight (which safely
 * resolves them to no element), but they never become workspace state.
 */
export function deriveReplayFocusPreparation(
  action: RecordedAction,
): ReplayFocusPreparation {
  const removesTransform = REMOVES_TRANSFORM_TARGET.has(action.id)
  const removesSymmetryTransform =
    removesTransform &&
    typeof action.args[0] === 'string' &&
    action.args[0].startsWith('_sym__')
  const semanticFocus = removesTransform
    ? removesSymmetryTransform
      ? 'ui:symmetry-card'
      : 'ui:transform-list'
    : focusHintFor(action.id, action.args)
  const spotlightFocus = semanticFocus ?? action.focus
  const target = targetFromFocusHint(spotlightFocus)
  if (target === undefined) return { spotlightFocus }

  const preparation: ReplayFocusPreparation = {
    spotlightFocus: target.focus,
  }
  const targetsSymmetryTransform =
    target.transformId?.startsWith('_sym__') === true
  if (target.kind === 'timeline') {
    preparation.timeline = COLLAPSE_HIDDEN_TIMELINE_FOCUS.has(target.focus)
      ? { show: true, expand: true }
      : { show: true }
  } else if (target.kind === 'floating-actions') {
    preparation.floatingActions = { expand: true }
  } else {
    preparation.sidebar = EDITOR_SIDEBAR
    if (target.kind === 'audio') preparation.audioPanel = { show: true }
    if (target.kind === 'sonification') {
      preparation.sonificationPanel = { show: true }
    }
  }

  if (targetsSymmetryTransform) {
    preparation.symmetryCard = { expand: true }
  } else if (target.transformId !== undefined) {
    preparation.transform = {
      id: target.transformId,
      select: true,
      expand: true,
    }
  }
  if (removesTransform) preparation.clearTransformSelection = true

  const affineMode = target.affineMode ?? affineModeFromAction(action)
  if (!targetsSymmetryTransform && affineMode !== undefined) {
    preparation.affineMode = affineMode
  }
  const affineTab = affineTabFromAction(action)
  if (!targetsSymmetryTransform && affineTab !== undefined) {
    preparation.affineTab = affineTab
  }
  if (!targetsSymmetryTransform && target.editorSurface !== undefined) {
    preparation.editorSurface = target.editorSurface
  }
  if (
    target.focus === 'ui:symmetry-type' ||
    target.focus === 'ui:symmetry-folds' ||
    target.focus === 'ui:symmetry-card'
  ) {
    preparation.symmetryCard = { expand: true }
  }
  if (action.id === 'flame.setMetadata' && target.kind === 'sidebar') {
    preparation.editorSurface = 'metadata'
  }
  if (
    (action.id === 'flame.setRenderSetting' ||
      action.id === 'flame.updateRenderSettings') &&
    target.kind === 'sidebar' &&
    target.focus.startsWith('param:')
  ) {
    preparation.editorSurface = 'render'
  }
  const colorView =
    colorViewFromAction(action) ??
    (target.editorSurface === 'color' && target.focus.startsWith('param:')
      ? 'list'
      : undefined)
  if (colorView !== undefined) preparation.colorView = colorView

  return preparation
}
