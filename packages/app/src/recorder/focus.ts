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

import { affineFocusId, affineRandomizeFocusId, affineResetFocusId, colorFocusId, colorRandomizeFocusId, colorResetFocusId, FINAL_AFFINE_FOCUS_ID, FINAL_AFFINE_RANDOMIZE_FOCUS_ID, transformFocusId, variationParamsFocusId, variationRandomizeFocusId, variationTypeFocusId, variationVisibilityFocusId, } from './focusIds'

/** Elements the follow-cam can be asked to look at, most specific first. */
export function focusSelectors(hint: string): string[] {
  const separator = hint.indexOf(':')
  if (separator < 0) return []
  const kind = hint.slice(0, separator)
  const value = hint.slice(separator + 1)
  if (value === '') return []
  const quoted = cssQuote(value)
  switch (kind) {
    case 'param':
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
  const first = args[0]
  const asString = typeof first === 'string' ? first : undefined

  switch (commandId) {
    // ---- render settings: the path is the hint -------------------------
    case 'flame.setRenderSetting':
      return asString === undefined ? undefined : `param:${asString}`
    case 'flame.updateRenderSettings': {
      if (args[1] === 'randomizer') return 'ui:randomizer-card'
      const patch = first
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
    case 'flame.setGamma':
      return 'param:gamma'
    case 'flame.setExposure':
      return 'param:exposure'
    case 'flame.setContrast':
      return 'param:contrast'
    case 'flame.setVibrancy':
      return 'param:vibrancy'
    case 'flame.setColorSpeed':
      return asString === undefined
        ? 'ui:transform-list'
        : `param:transform.${asString}.colorSpeed`
    case 'flame.setSkipIters':
      return 'param:skipIters'
    case 'flame.setDrawMode':
      return 'param:drawMode'
    case 'flame.setBackgroundColor':
      return 'ui:backgroundColor-picker'
    case 'flame.setBlendWeight':
      return 'ui:blendWeight-slider'

    // ---- structure: point at the row that changed -----------------------
    case 'flame.addTransform':
    case 'flame.clearTransforms':
      return 'ui:transform-list'
    case 'flame.removeTransform':
    case 'flame.deleteTransform':
      // The row is gone before follow-cam measures the action.
      return 'ui:transform-list'
    case 'flame.setTransformVisible':
      return asString === undefined
        ? 'ui:transform-list'
        : `focus:${transformFocusId(asString)}`
    case 'flame.setProbability':
      return asString === undefined
        ? 'ui:transform-list'
        : `param:transform.${asString}.probability`
    case 'flame.setTransformColor':
      if (asString === undefined) return 'ui:transform-list'
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
    case 'flame.setTransformAffine':
      if (asString === undefined) return 'ui:affine-editor'
      if (args[3] === 'randomize') {
        return `focus:${affineRandomizeFocusId(asString)}`
      }
      if (args[3] === 'reset') {
        return `focus:${affineResetFocusId(asString)}`
      }
      return `focus:${affineFocusId(asString)}`
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
    case 'flame.setFinalTransform':
      return first === null || first === undefined
        ? 'ui:affine-editor'
        : args[1] === 'randomize'
          ? `focus:${FINAL_AFFINE_RANDOMIZE_FOCUS_ID}`
          : `focus:${FINAL_AFFINE_FOCUS_ID}`
    case 'flame.setFinalAffine':
      return typeof first === 'string'
        ? `param:finalTransform.${first}`
        : `focus:${FINAL_AFFINE_FOCUS_ID}`
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
    case 'flame.deleteVariation':
      // The deleted row is gone by the time follow-cam measures it. Keep the
      // correct transform in view instead of pointing at another variation.
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
    case 'flame.setVariationParams':
      return typeof args[2] === 'string' && typeof first === 'string'
        ? `param:${first}.${String(args[1])}.${args[2]}`
        : 'ui:variation-type'
    case 'flame.applySymmetry':
      return 'ui:add-symmetry'
    case 'flame.applyPalette':
    case 'flame.removePalette':
      return 'ui:palette-selector'
    case 'flame.setAllTransformColors':
      return 'ui:randomize-colors'
    case 'flame.randomize':
    case 'flame.mutate':
    case 'flame.setupMorph':
      return 'ui:randomizer-card'
    case 'flame.setMetadata':
      return typeof first === 'string'
        ? `param:metadata.${first}`
        : 'ui:metadata-card'

    // ---- view, timeline, audio -----------------------------------------
    case 'camera.zoomTo':
    case 'camera.center':
      return 'ui:canvas'
    case 'timeline.play':
      return 'ui:play-button'
    case 'timeline.setCurrentFrame':
    case 'timeline.goToFrame':
      return 'ui:seek-ruler'
    case 'timeline.addKeyframe':
    case 'timeline.addKeyframes':
    case 'timeline.removeKeyframe':
    case 'timeline.setKeyframeValue':
    case 'timeline.setKeyframeInterp':
    case 'timeline.moveKeyframe':
    case 'timeline.relocateKeyframe':
    case 'timeline.removeTrack':
    case 'timeline.clearTracks':
      return 'ui:dope-sheet'
    case 'timeline.setFps':
    case 'timeline.setAutoFps':
    case 'timeline.setTimeScale':
    case 'timeline.setLoop':
    case 'timeline.setDuration':
    case 'timeline.setLoopMode':
    case 'timeline.loadTimeline':
      return 'ui:timeline-section'
    case 'timeline.setAutoKeyframe':
      return 'ui:auto-keyframe'
    case 'timeline.setAnimationEnabled':
      return 'ui:animation-toggle'
    case 'audio.setMapping':
    case 'audio.setEnabled':
    case 'audio.setSource':
    case 'audio.applySnapshot':
      return 'ui:audio-panel'

    // ---- app chrome ------------------------------------------------------
    case 'view.setQualityPreset':
      return 'ui:quality-presets'
    case 'view.setAdaptiveFilter':
      return 'ui:adaptive-filter'
    case 'view.setDimensions':
    case 'view.setStochasticFilter':
    case 'view.setFlyMode':
      return 'ui:view-controls'
    case 'view.setPixelRatio':
      return 'ui:pixelRatio-buttons'
    case 'view.setShowTimeline':
      return 'ui:animation-toggle'
    case 'sidebar.open':
    case 'sidebar.close':
      return 'ui:sidebar'
    case 'history.undo':
    case 'history.redo':
      return 'ui:undoRedo-controls'
    case 'export.png':
      return 'ui:export-png'
    case 'export.animation':
      return 'ui:timeline-section'
    default:
      return undefined
  }
}
