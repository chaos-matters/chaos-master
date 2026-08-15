import { registerCommand } from '../registry'

/**
 * The actions-toolbar switches: quality preset, the two filters, 2D/3D, fly
 * mode, timeline visibility.
 *
 * None of these live in the flame descriptor, so none of them touched the undo
 * stack and none were recorded — yet flipping the adaptive filter or switching
 * to 3D changes the picture completely, and a replay that skipped them landed
 * somewhere the recording never was. They are viewport state, so they are not
 * undoable and that is deliberate; being recordable is a separate question,
 * and the answer is yes.
 */

function boolArg(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

registerCommand({
  id: 'view.setQualityPreset',
  label: 'Set Quality Preset',
  description: 'Choose the render quality preset',
  describe: ([key]) =>
    typeof key === 'string' ? `Quality: ${key}` : undefined,
  execute(ctx, key?: unknown) {
    if (typeof key !== 'string' || key === '') return
    ctx.view?.setQualityPreset(key)
  },
})

registerCommand({
  id: 'view.setPixelRatio',
  label: 'Set Canvas Resolution',
  description: 'Choose the live canvas resolution scale',
  execute(ctx, ratio?: unknown) {
    if (ratio !== 1 && ratio !== 0.5 && ratio !== 0.25) return
    ctx.setPixelRatio(ratio)
  },
})

registerCommand({
  id: 'view.setAdaptiveFilter',
  label: 'Toggle Adaptive Filter',
  description: 'Adaptive density-estimation blur',
  describe: ([on]) =>
    typeof on === 'boolean'
      ? `${on ? 'Enable' : 'Disable'} adaptive filter`
      : undefined,
  execute(ctx, on?: unknown) {
    const value = boolArg(on)
    if (value === undefined) return
    ctx.view?.setAdaptiveFilter(value)
  },
})

registerCommand({
  id: 'view.setStochasticFilter',
  label: 'Toggle Stochastic Filter',
  description: 'Mitchell-Netravali stochastic resampling',
  describe: ([on]) =>
    typeof on === 'boolean'
      ? `${on ? 'Enable' : 'Disable'} stochastic filter`
      : undefined,
  execute(ctx, on?: unknown) {
    const value = boolArg(on)
    if (value === undefined) return
    ctx.view?.setStochasticFilter(value)
  },
})

/* No `view.setDimensions`: a 2D↔3D switch restores an in-memory stash, so
   replaying it would land on the VIEWER's stashed flame rather than the one
   the recording produced. The workspace records the resulting descriptor and
   tracks instead (`flame.load` + `timeline.loadTimeline`, via
   recordSyntheticAction), which replay exactly. */

registerCommand({
  id: 'view.setFlyMode',
  label: 'Toggle Fly Mode',
  description: 'First-person camera control in 3D',
  execute(ctx, on?: unknown) {
    const value = boolArg(on)
    if (value === undefined) return
    ctx.view?.setFlyMode(value)
  },
})

registerCommand({
  id: 'view.setShowTimeline',
  label: 'Toggle Timeline Panel',
  description: 'Show or hide the timeline',
  execute(ctx, shown?: unknown) {
    const value = boolArg(shown)
    if (value === undefined) return
    ctx.view?.setShowTimeline(value)
  },
})
