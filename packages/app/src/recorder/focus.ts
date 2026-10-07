/**
 * Follow-cam hints: **what to look at** while a step runs, never **where**.
 *
 * The number one killer of tool-video retention is a dense UI at full size
 * while something small changes in a corner — nobody can see which slider
 * moved (docs/channel-content-plan.md §7). So each recorded action carries a
 * hint, and replay spotlights the matching control.
 *
 * A hint is a short semantic string, not a rectangle and not a selector, for
 * two reasons: a session recorded at one window size has to direct correctly
 * at another, and a selector baked into a file from 2026 would rot the first
 * time the markup changed. Resolution happens at replay time, here, where it
 * can be fixed.
 *
 * Grammar — `kind:value`:
 *
 *   param:<parameterPath>   a slider/scrub/select for that parameter
 *   ui:<tourTarget>         an element already anchored for the tours
 *   focus:<id>              an element carrying `data-focus-id`
 *
 * `ui:` deliberately reuses the `data-tour-target` vocabulary rather than
 * inventing a second one: ~55 controls already carry it, the tours keep it
 * honest, and anything worth spotlighting in a video was already worth
 * pointing at in a tour.
 */

import { affineFocusId, affineRandomizeFocusId, affineResetFocusId, colorFocusId, colorRandomizeFocusId, colorResetFocusId, FINAL_AFFINE_FOCUS_ID, FINAL_AFFINE_RANDOMIZE_FOCUS_ID, transformColorRandomizeFocusId, transformFocusId, transformVisibilityFocusId, variationParamsFocusId, variationRandomizeFocusId, variationTypeFocusId, variationVisibilityFocusId, } from './focusIds'
import { snapshotOriginFocus, snapshotOriginForCommand } from './snapshotOrigin'
import type { FlameCommand } from '@/commands/types'

/**
 * The 3D control that stands in for a 2D camera parameter.
 *
 * One verb, two viewports: `camera.zoom` and `camera3D.radius` are the same
 * knob under different names, and the orbit target has no control of its own,
 * so a pan points at the orbit group as a whole. Offering both sets of
 * selectors is what lets every caller stay dimension-blind — ViewControls
 * mounts the 2D group or the 3D one and never both, so at most one can match.
 */
const CAMERA_3D_COUNTERPART = new Map([
  ['camera.zoom', 'camera3D.radius'],
  ['camera.position', 'camera3D'],
])

function paramSelectors(value: string): string[] {
  const quoted = cssQuote(value)
  return [
    `[data-parameter-path=${quoted}]`,
    // The tour anchors name the control by role, and which suffix a given
    // parameter uses is not derivable — try the ones in use.
    `[data-tour-target=${cssQuote(`${value}-slider`)}]`,
    `[data-tour-target=${cssQuote(`${value}-select`)}]`,
    `[data-tour-target=${cssQuote(`${value}-picker`)}]`,
    `[data-tour-target=${cssQuote(`${value}-buttons`)}]`,
    `[data-tour-target=${cssQuote(`${value}-controls`)}]`,
  ]
}

/** Elements the follow-cam can be asked to look at, most specific first. */
export function focusSelectors(hint: string): string[] {
  const separator = hint.indexOf(':')
  if (separator < 0) return []
  const kind = hint.slice(0, separator)
  const value = hint.slice(separator + 1)
  if (value === '') return []
  const quoted = cssQuote(value)
  switch (kind) {
    case 'param': {
      // A Map, not an object literal: hints come out of session files, and
      // `param:constructor` against a literal answers with a function, which
      // `cssQuote` would then throw on rather than resolve to no element.
      const counterpart = CAMERA_3D_COUNTERPART.get(value)
      return counterpart === undefined
        ? paramSelectors(value)
        : [...paramSelectors(value), ...paramSelectors(counterpart)]
    }
    case 'ui':
      return [`[data-tour-target=${quoted}]`]
    case 'focus': {
      const selectors = [`[data-focus-id=${quoted}]`]
      // Nested transform controls are unmounted when their card is collapsed.
      // Retain transform identity in that state instead of falling back to the
      // first global tour anchor (or clearing the spotlight altogether).
      const owner = transformOwnerFocusId(value)
      if (owner !== undefined && owner !== value) {
        selectors.push(`[data-focus-id=${cssQuote(owner)}]`)
      }
      return selectors
    }
    default:
      return []
  }
}

/**
 * The first visible element a hint resolves to, or null.
 *
 * Zero-sized matches are skipped rather than accepted: a control inside a
 * collapsed card is in the DOM but spotlighting it would frame an empty
 * rectangle, and the next selector in the list is usually a container that
 * IS visible.
 */
export function resolveFocusElement(hint: string): Element | null {
  for (const selector of focusSelectors(hint)) {
    let matches: NodeListOf<Element>
    try {
      matches = document.querySelectorAll(selector)
    } catch {
      continue
    }
    for (const element of matches) {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) return element
    }
  }
  return null
}

/**
 * Reveal a resolved follow-cam target in every scrollable ancestor.
 *
 * `nearest` is important for the editor: a render control may sit inside a
 * scrolled sidebar, while the recorder dock and canvas should not jump. The
 * browser scrolls only the container(s) that actually clip the target and
 * leaves already-visible controls untouched. `auto` also respects each
 * container's own scroll-behavior and reduced-motion policy.
 */
export function revealFocusElement(element: Element): void {
  element.scrollIntoView({
    behavior: 'auto',
    block: 'nearest',
    inline: 'nearest',
  })
}

/** Escape a hint value for use inside an attribute selector. Hints come from
 *  session files, which are user data — `CSS.escape` is not enough on its own
 *  because the value goes inside quotes. */
function cssQuote(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&')}"`
}

function transformOwnerFocusId(value: string): string | undefined {
  const match = /^tx:([^:]+)(?::|$)/.exec(value)
  return match?.[1] ? transformFocusId(match[1]) : undefined
}

/**
 * The hint for one command invocation — a command's own `focus()` if it has
 * one, else the table below.
 *
 * The override matters: a command that bothers to say where it lives knows
 * better than the central table, and a caller that reaches for `focusHintFor`
 * directly silently loses that for exactly those commands. Both the recorder
 * and the live pilot resolve their hints through here so the two cannot say
 * different things about the same command.
 */
export function focusForCommand(
  cmd: Pick<FlameCommand, 'id' | 'focus'>,
  args: unknown[],
): string | undefined {
  return cmd.focus?.(args) ?? focusHintFor(cmd.id, args)
}

/**
 * The hint for a command invocation, derived centrally rather than declared on
 * each of the ~60 commands.
 *
 * Central because the mapping is mostly mechanical (a parameter path IS the
 * hint) and because a table can be read in one sitting to see what is still
 * unpointed-at. Commands that need something the args do not reveal can
 * declare `focus` themselves; that wins (see recordCommandExecution).
 */
const STATIC_COMMAND_HINTS: Readonly<Record<string, string>> = Object.freeze({
  // ---- render settings ------------------------------------------------
  'flame.setGamma': 'param:gamma',
  'flame.setExposure': 'param:exposure',
  'flame.setContrast': 'param:contrast',
  'flame.setVibrancy': 'param:vibrancy',
  'flame.setSkipIters': 'param:skipIters',
  'flame.setDrawMode': 'param:drawMode',
  'flame.setBackgroundColor': 'ui:backgroundColor-picker',
  'flame.setBlendWeight': 'ui:blendWeight-slider',
  'flame.setBlendFlame': 'ui:blend-picker',

  // ---- structure ------------------------------------------------------
  'flame.addTransform': 'ui:transform-list',
  'flame.clearTransforms': 'ui:transform-list',
  'flame.removeTransform': 'ui:transform-list',
  'flame.deleteTransform': 'ui:transform-list',
  'flame.applyPalette': 'ui:palette-selector',
  'flame.removePalette': 'ui:palette-selector',
  'flame.setAllTransformColors': 'ui:randomize-colors',
  'flame.randomize': 'ui:randomizer-generate',
  'flame.mutate': 'ui:randomizer-mutate',
  'flame.setupMorph': 'ui:morph-picker',

  // ---- view, camera ---------------------------------------------------
  'camera.zoomTo': 'param:camera.zoom',
  'camera.zoomBy': 'param:camera.zoom',
  'camera.center': 'param:camera.zoom',
  'camera.frame': 'param:camera.zoom',
  'camera.panTo': 'param:camera.position',
  'camera.panBy': 'param:camera.position',

  // ---- timeline -------------------------------------------------------
  'timeline.play': 'ui:play-button',
  'timeline.setPlaying': 'ui:play-button',
  'timeline.setCurrentFrame': 'ui:seek-ruler',
  'timeline.goToFrame': 'ui:seek-ruler',
  'timeline.addKeyframe': 'ui:dope-sheet',
  'timeline.addKeyframes': 'ui:dope-sheet',
  'timeline.removeKeyframe': 'ui:dope-sheet',
  'timeline.setKeyframeValue': 'ui:dope-sheet',
  'timeline.setKeyframeInterp': 'ui:dope-sheet',
  'timeline.moveKeyframe': 'ui:dope-sheet',
  'timeline.relocateKeyframe': 'ui:dope-sheet',
  'timeline.removeTrack': 'ui:dope-sheet',
  'timeline.clearTracks': 'ui:animation-clear',
  'timeline.setFps': 'ui:timeline-fps',
  'timeline.setAutoFps': 'ui:timeline-auto-fps',
  'timeline.setTimeScale': 'ui:timeline-speed',
  'timeline.setLoop': 'ui:timeline-loop',
  'timeline.setDuration': 'ui:timeline-duration',
  'timeline.setLoopMode': 'ui:timeline-loop-mode',
  'timeline.setAutoKeyframe': 'ui:auto-keyframe',
  'timeline.setAnimationEnabled': 'ui:animation-toggle',

  // ---- audio, sonification --------------------------------------------
  'audio.setMapping': 'ui:audio-panel',
  'audio.setEnabled': 'ui:audio-panel',
  'audio.setSource': 'ui:audio-panel',
  'audio.applySnapshot': 'ui:audio-panel',
  'sonification.setEnabled': 'param:sonification.enabled',

  // ---- app chrome -----------------------------------------------------
  'view.setQualityPreset': 'ui:quality-presets',
  'view.setAdaptiveFilter': 'ui:adaptive-filter',
  'view.setDimensions': 'ui:dimension-toggle',
  'view.setStochasticFilter': 'ui:stochastic-filter',
  'view.setFlyMode': 'ui:fly-mode',
  'view.setPixelRatio': 'ui:pixelRatio-buttons',
  'view.setShowTimeline': 'ui:show-timeline',
  'sidebar.open': 'ui:sidebar',
  'sidebar.close': 'ui:sidebar',
  'history.undo': 'ui:undoRedo-controls',
  'history.redo': 'ui:undoRedo-controls',
  'export.png': 'ui:export-png',
  'export.animation': 'ui:timeline-section',
  'glide.setEnabled': 'ui:replay-glide',
  'glide.setQuality': 'ui:replay-glide',
  // `glide.toFlame` is deliberately absent, like a whole-flame load: the
  // change is the whole picture, and there is no one control to spotlight.
  // Not `ui:canvas` either — see the note above the camera cases.
})

function resolveRenderSettingHint(
  commandId: string,
  args: readonly unknown[],
  asString?: string,
): string | undefined {
  if (commandId === 'flame.setRenderSetting') {
    return asString === undefined ? undefined : `param:${asString}`
  }
  if (commandId === 'flame.updateRenderSettings') {
    if (args[1] === 'randomizer') return 'ui:randomizer-card'
    const patch = args[0]
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
      return undefined
    }
    if (Object.hasOwn(patch, 'exposure')) return 'param:exposure'
    if (Object.hasOwn(patch, 'autoExposure3D')) {
      return 'param:autoExposure3D'
    }
    const [firstPath] = Object.keys(patch)
    return firstPath === undefined ? undefined : `param:${firstPath}`
  }
  return undefined
}

function resolveTransformPropertyHint(
  commandId: string,
  args: readonly unknown[],
  asString?: string,
): string | undefined {
  switch (commandId) {
    case 'flame.setColorSpeed':
      return asString === undefined
        ? 'ui:transform-list'
        : `param:transform.${asString}.colorSpeed`
    case 'flame.setTransformVisible':
      return asString === undefined
        ? 'ui:transform-list'
        : `focus:${transformVisibilityFocusId(asString)}`
    case 'flame.setProbability':
      return asString === undefined
        ? 'ui:transform-list'
        : `param:transform.${asString}.probability`
    case 'flame.setTransformColor': {
      if (asString === undefined) return 'ui:transform-list'
      if (args[3] === 'card-randomize') {
        return `focus:${transformColorRandomizeFocusId(asString)}`
      }
      if (args[3] === 'x' || args[3] === 'y') {
        return `param:transform.${asString}.color.${args[3]}`
      }
      if (args[3] === 'randomize') {
        return `focus:${colorRandomizeFocusId(asString)}`
      }
      if (args[3] === 'reset') {
        return `focus:${colorResetFocusId(asString)}`
      }
      return `focus:${colorFocusId(asString)}`
    }
    default:
      return undefined
  }
}

function resolveTransformAffineHint(
  commandId: string,
  args: readonly unknown[],
  asString?: string,
): string | undefined {
  switch (commandId) {
    case 'flame.setTransformAffine': {
      if (asString === undefined) return 'ui:affine-editor'
      if (args[3] === 'randomize') {
        return `focus:${affineRandomizeFocusId(asString)}`
      }
      if (args[3] === 'reset') {
        return `focus:${affineResetFocusId(asString)}`
      }
      return `focus:${affineFocusId(asString)}`
    }
    case 'flame.setAffine': {
      if (
        asString === undefined ||
        (args[1] !== 'pre' && args[1] !== 'post') ||
        typeof args[2] !== 'string'
      ) {
        return 'ui:affine-editor'
      }
      const affine = args[1] === 'post' ? 'postAffine' : 'preAffine'
      return `param:transform.${asString}.${affine}.${args[2]}`
    }
    case 'flame.setFinalTransform': {
      const first = args[0]
      return first === null || first === undefined
        ? 'ui:affine-editor'
        : args[1] === 'randomize'
          ? `focus:${FINAL_AFFINE_RANDOMIZE_FOCUS_ID}`
          : `focus:${FINAL_AFFINE_FOCUS_ID}`
    }
    case 'flame.setFinalAffine': {
      const first = args[0]
      return typeof first === 'string'
        ? `param:finalTransform.${first}`
        : `focus:${FINAL_AFFINE_FOCUS_ID}`
    }
    default:
      return undefined
  }
}

function resolveVariationTypeHint(
  commandId: string,
  args: readonly unknown[],
  asString?: string,
): string | undefined {
  switch (commandId) {
    case 'flame.setVariation':
    case 'flame.applyVariationSelection': {
      const variationId = args[1]
      if (asString === undefined || typeof variationId !== 'string') {
        return 'ui:variation-type'
      }
      if (commandId === 'flame.setVariation') {
        if (args[3] === 'randomize') {
          return `focus:${variationRandomizeFocusId(asString, variationId)}`
        }
        if (args[3] === 'params') {
          return `focus:${variationParamsFocusId(asString, variationId)}`
        }
      }
      return `focus:${variationTypeFocusId(asString, variationId)}`
    }
    case 'flame.addVariation': {
      const variationId = args[2]
      return asString !== undefined && typeof variationId === 'string'
        ? `focus:${variationTypeFocusId(asString, variationId)}`
        : 'ui:variation-type'
    }
    default:
      return undefined
  }
}

function resolveVariationPropertyHint(
  commandId: string,
  args: readonly unknown[],
  asString?: string,
): string | undefined {
  switch (commandId) {
    case 'flame.deleteVariation':
      return asString === undefined
        ? 'ui:transform-list'
        : `focus:${transformFocusId(asString)}`
    case 'flame.setVariationVisible': {
      const variationId = args[1]
      return asString !== undefined && typeof variationId === 'string'
        ? `focus:${variationVisibilityFocusId(asString, variationId)}`
        : 'ui:variation-type'
    }
    case 'flame.setVariationWeight':
      return asString !== undefined && typeof args[1] === 'string'
        ? `param:${asString}.${args[1]}`
        : 'ui:variation-weight'
    case 'flame.setVariationParams': {
      const first = args[0]
      return typeof args[2] === 'string' && typeof first === 'string'
        ? `param:${first}.${String(args[1])}.${args[2]}`
        : 'ui:variation-type'
    }
    case 'flame.applySymmetry':
      return args[3] === 'type'
        ? 'ui:symmetry-type'
        : args[3] === 'folds'
          ? 'ui:symmetry-folds'
          : 'ui:add-symmetry'
    default:
      return undefined
  }
}

function resolveAppControlHint(
  commandId: string,
  args: readonly unknown[],
): string | undefined {
  switch (commandId) {
    case 'flame.load':
      return snapshotOriginFocus(snapshotOriginForCommand(commandId, args))
    case 'flame.setMetadata': {
      const first = args[0]
      return typeof first === 'string'
        ? `param:metadata.${first}`
        : 'ui:metadata-card'
    }
    case 'timeline.loadTimeline':
      return (
        snapshotOriginFocus(snapshotOriginForCommand(commandId, args)) ??
        'ui:timeline-section'
      )
    case 'sonification.setConfig':
      return typeof args[1] === 'string'
        ? `param:sonification.${args[1]}`
        : 'ui:sonification-panel'
    default:
      return undefined
  }
}

/**
 * The hint for a command invocation, derived centrally rather than declared on
 * each of the ~60 commands.
 *
 * Central because the mapping is mostly mechanical (a parameter path IS the
 * hint) and because a table can be read in one sitting to see what is still
 * unpointed-at. Commands that need something the args do not reveal can
 * declare `focus` themselves; that wins (see recordCommandExecution).
 */
export function focusHintFor(
  commandId: string,
  args: readonly unknown[],
): string | undefined {
  const staticHint = STATIC_COMMAND_HINTS[commandId]
  if (staticHint !== undefined) {
    return staticHint
  }
  const asString = typeof args[0] === 'string' ? args[0] : undefined
  return (
    resolveRenderSettingHint(commandId, args, asString) ??
    resolveTransformPropertyHint(commandId, args, asString) ??
    resolveTransformAffineHint(commandId, args, asString) ??
    resolveVariationTypeHint(commandId, args, asString) ??
    resolveVariationPropertyHint(commandId, args, asString) ??
    resolveAppControlHint(commandId, args)
  )
}
