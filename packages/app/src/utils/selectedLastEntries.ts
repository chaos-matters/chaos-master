import { createMemo } from 'solid-js'

/**
 * Entries of a keyed record with the selected id moved LAST, preserving tuple
 * identity across reorders and value edits. SVG paints in document order, so
 * "last" renders on top — the selected transform's handle both shows above a
 * stack of overlapping handles and receives the click. Stable identity makes
 * <For> MOVE the existing row instead of recreating it, which keeps an
 * in-flight pointer gesture (select-on-press + immediate drag) alive through
 * the reorder — createDragHandler aborts a drag whose component unmounts.
 */
export function createSelectedLastEntries<T extends Record<string, object>>(
  record: () => T,
  selectedId: () => string | null | undefined,
) {
  type Entry = [keyof T, T[keyof T]]
  const cache = new Map<keyof T, Entry>()
  return createMemo(() => {
    const seen = new Set<keyof T>()
    const entries = (Object.entries(record()) as Entry[]).map(([id, value]) => {
      seen.add(id)
      const cached = cache.get(id)
      if (cached && cached[1] === value) return cached
      const tuple: Entry = [id, value]
      cache.set(id, tuple)
      return tuple
    })
    for (const id of cache.keys()) {
      if (!seen.has(id)) cache.delete(id)
    }
    const sel = selectedId()
    if (!sel) return entries
    const idx = entries.findIndex(([id]) => id === sel)
    if (idx === -1 || idx === entries.length - 1) return entries
    const copy = entries.slice()
    const [selected] = copy.splice(idx, 1)
    copy.push(selected!)
    return copy
  })
}
