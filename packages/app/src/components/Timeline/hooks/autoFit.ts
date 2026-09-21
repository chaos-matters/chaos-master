/**
 * When the dope sheet should fit the whole animation into view by itself.
 *
 * Loading a flame that carries an animation used to leave the timeline at
 * whatever zoom it happened to have, so a 360-frame sequence opened showing its
 * first ninety frames and the rest was off the right edge — the viewer had to
 * find the Fit button to see what they had just loaded.
 *
 * The rule is "fit on arrival, then leave it alone": a load re-fits and hands
 * the view back in a clean state, a span change re-fits only while the view is
 * still the one we chose, and a zoom or scroll the person made themselves is
 * theirs until the next load. An Arcade pilot is the exception, because the
 * workspace is locked for the whole time it can fire and the viewer cannot
 * have set that zoom.
 *
 * Kept as a pure function so the decision is testable without a DOM, a
 * ResizeObserver or a WebGPU canvas.
 */

export type AutoFitInputs = {
  /** Bumped by the timeline every time a whole animation is loaded. */
  loadRevision: number
  /** endFrame - startFrame: what "everything" currently means. */
  totalFrames: number
  /** True once the person has zoomed or scrolled since the last load. */
  userAdjusted: boolean
  /** True while an Arcade pilot drives; the workspace is locked. */
  agentDriving: boolean
}

export type AutoFitDecision = {
  /** Call autoFitZoom now. */
  fit: boolean
  /** Forget that the person had adjusted the view — a new document arrived. */
  resetUserAdjusted: boolean
}

const NOTHING: AutoFitDecision = { fit: false, resetUserAdjusted: false }

/**
 * @param previous what the last call saw, or undefined on the very first one.
 *   The first observation never fits: the dope sheet already fits itself once
 *   the ruler gets its first real width, and firing here as well would fight
 *   that with a stale container size.
 */
export function autoFitDecision(
  next: AutoFitInputs,
  previous: Pick<AutoFitInputs, 'loadRevision' | 'totalFrames'> | undefined,
): AutoFitDecision {
  if (previous === undefined) return NOTHING
  const loaded = next.loadRevision !== previous.loadRevision
  const spanChanged = next.totalFrames !== previous.totalFrames
  if (!loaded && !spanChanged) return NOTHING
  if (next.totalFrames <= 0) return { fit: false, resetUserAdjusted: loaded }
  // A load is a new document: it re-fits whatever the person had done, and
  // clears that history. A span change on its own defers to them.
  const fit = loaded || next.agentDriving || !next.userAdjusted
  return { fit, resetUserAdjusted: loaded }
}
