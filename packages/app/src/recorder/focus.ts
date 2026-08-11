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
    case 'focus':
      return [`[data-focus-id=${quoted}]`]
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
export function resolveFocusElement(hint: string): HTMLElement | null {
  for (const selector of focusSelectors(hint)) {
    let matches: NodeListOf<Element>
    try {
      matches = document.querySelectorAll(selector)
    } catch {
      continue
    }
    for (const element of matches) {
      if (!(element instanceof HTMLElement)) continue
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) return element
    }
  }
  return null
}

/** Escape a hint value for use inside an attribute selector. Hints come from
 *  session files, which are user data — `CSS.escape` is not enough on its own
 *  because the value goes inside quotes. */
function cssQuote(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&')}"`
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
    case 'flame.setGamma':
      return 'param:gamma'
    case 'flame.setExposure':
      return 'param:exposure'
    case 'flame.setContrast':
      return 'param:contrast'
    case 'flame.setVibrancy':
      return 'param:vibrancy'
    case 'flame.setColorSpeed':
      return 'param:colorSpeed'
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
    case 'flame.deleteTransform':
    case 'flame.removeTransform':
    case 'flame.setTransformVisible':
    case 'flame.setProbability':
      return asString === undefined
        ? 'ui:transform-list'
        : `focus:tx:${asString}`
    case 'flame.setTransformColor':
      return asString === undefined
        ? 'ui:transform-list'
        : `focus:tx:${asString}`
    case 'flame.setTransformAffine':
    case 'flame.setAffine':
      return 'ui:affine-editor'
    case 'flame.setFinalTransform':
      return 'ui:affine-editor'
    case 'flame.addVariation':
    case 'flame.setVariation':
    case 'flame.deleteVariation':
    case 'flame.setVariationVisible':
    case 'flame.applyVariationSelection':
      return 'ui:variation-type'
    case 'flame.setVariationWeight':
      return 'ui:variation-weight'
    case 'flame.setVariationParams':
      return typeof args[2] === 'string' && typeof first === 'string'
        ? `param:transforms.${first}.variations.${String(args[1])}.${args[2]}`
        : 'ui:variation-type'
    case 'flame.applySymmetry':
      return 'ui:add-symmetry'
    case 'flame.applyPalette':
    case 'flame.removePalette':
    case 'flame.setAllTransformColors':
      return 'ui:paletteMode-select'
    case 'flame.randomize':
    case 'flame.mutate':
    case 'flame.setupMorph':
      return 'ui:randomizer-card'
    case 'flame.setMetadata':
      return 'ui:metadata-card'

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
    case 'timeline.removeKeyframe':
    case 'timeline.setKeyframeValue':
    case 'timeline.setKeyframeInterp':
    case 'timeline.moveKeyframe':
    case 'timeline.removeTrack':
    case 'timeline.clearTracks':
      return 'ui:dope-sheet'
    case 'timeline.setFps':
    case 'timeline.setLoop':
    case 'timeline.setDuration':
    case 'timeline.setLoopMode':
      return 'ui:timeline-section'
    case 'timeline.setAutoKeyframe':
      return 'ui:auto-keyframe'
    case 'timeline.setAnimationEnabled':
      return 'ui:animation-toggle'
    case 'audio.setMapping':
    case 'audio.setEnabled':
    case 'audio.setSource':
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
