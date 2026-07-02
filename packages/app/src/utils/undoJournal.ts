/**
 * Shared ordering journal for the app's undo systems.
 *
 * The flame change-history (patch-based) and the timeline (track snapshots)
 * keep separate stacks, but the user has ONE mental undo timeline: "revert my
 * last action". Every journaled push takes a monotonic sequence number so a
 * router can arbitrate by recency (undo the larger seq; redo the smaller —
 * i.e. replay forward in original order).
 *
 * A new edit in EITHER system must also invalidate redo in BOTH — after
 * undoing and then editing, "redo" resurrecting unrelated stale state from
 * the other system is never what the user means. Systems register a
 * redo-clearer; any journaled push clears them all.
 *
 * Participation is opt-in: throwaway histories (e.g. the variation browser's
 * preview flames) stay isolated and must neither stamp nor clear.
 */

let seq = 0

/** Next monotonic stamp for a journaled undo entry. */
export function nextUndoSeq(): number {
  return ++seq
}

const redoClearers = new Set<() => void>()

/** Register a system's redo-clearer; returns an unregister function. */
export function registerRedoClearer(clear: () => void): () => void {
  redoClearers.add(clear)
  return () => {
    redoClearers.delete(clear)
  }
}

/** Invalidate redo in every journaled system (called on any journaled push). */
export function clearAllRedos() {
  for (const clear of redoClearers) clear()
}
