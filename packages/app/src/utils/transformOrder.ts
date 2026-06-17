// UI-only, session-scoped display order for transforms.
//
// Transform ids are random UUIDs, so sorting by id is arbitrary, and the
// underlying object's key order isn't stable across delete+undo (the undo patch
// re-adds the key at the end). To give a predictable list — new transforms at
// the bottom, a deleted+undone one back in its original spot — we remember the
// order each transform id is FIRST seen (in the flame's current insertion order)
// and sort by that. This is purely a display concern and is never written to the
// flame.

const firstSeen = new Map<string, number>()
let counter = 0

/** Stable display index for a transform id (assigned on first sight). */
function displayIndex(tid: string): number {
  let idx = firstSeen.get(tid)
  if (idx === undefined) {
    idx = counter++
    firstSeen.set(tid, idx)
  }
  return idx
}

/**
 * Sort transform `[id, value]` entries by first-seen order. New ids are assigned
 * in the order given (the flame's insertion order), so a freshly added transform
 * sorts to the end and a re-added (undone) one keeps its place.
 */
export function sortedTransformEntries<V>(
  entries: readonly [string, V][],
): [string, V][] {
  // Register any ids we haven't seen yet, in the given order, BEFORE sorting.
  for (const [tid] of entries) displayIndex(tid)
  return [...entries].sort(([a], [b]) => displayIndex(a) - displayIndex(b))
}
