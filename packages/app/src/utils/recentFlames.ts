import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { safeGetItem, safeRemoveItem, safeSetItem } from '@/utils/storage'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineTrack } from '@/utils/timeline'

const STORAGE_KEY = 'chaos-master-recent-flames'
export const MAX_RECENT_FLAMES = 150

export type RecentFlame = {
  id: string
  name: string
  flame: FlameDescriptor
  savedAt: number
  tracks?: TimelineTrack[]
}

export function newRecentFlameId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function isValidRecentFlame(item: unknown): item is RecentFlame {
  if (typeof item !== 'object' || item === null) return false
  const obj = item as Record<string, unknown>
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.savedAt === 'number' &&
    typeof obj.flame === 'object'
  )
}

/** Memo for `loadRecentFlames`, keyed on the exact payload it was built from.
 *
 *  The schema pass costs ~90ms for a full 150-entry list (measured; `JSON.parse`
 *  of the same payload is ~2ms), and the Load Flame modal reloads the list on
 *  open, on import and on every delete — so without this, opening the modal
 *  re-validates the same 150 flames and blocks the frame each time.
 *
 *  Keying on the raw string rather than asking writers to invalidate means any
 *  write invalidates it for free, including ones this module never sees: another
 *  tab, a devtools edit, or a future writer that forgets to call an invalidator.
 *
 *  Entries are shared with every caller, so they must be treated as read-only —
 *  which is already the contract elsewhere (consumers `deepClone` before
 *  editing). Only the outer array is copied per call, so callers can still
 *  filter and spread freely. */
let validatedCache: { raw: string; entries: readonly RecentFlame[] } | undefined

/** Test seam: drop the memo so a test can observe a fresh validation pass. */
export function clearRecentFlamesCache(): void {
  validatedCache = undefined
}

export function loadRecentFlames(): RecentFlame[] {
  try {
    const raw = safeGetItem(STORAGE_KEY)
    if (raw === null) return []
    if (validatedCache?.raw === raw) return [...validatedCache.entries]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const entries = parsed.filter(isValidRecentFlame).flatMap((item) => {
      const flame = tryValidateFlame(item.flame)
      return flame ? [{ ...item, flame }] : []
    })
    validatedCache = { raw, entries }
    return [...entries]
  } catch {
    return []
  }
}

export function saveRecentFlame(
  flame: FlameDescriptor,
  name?: string,
  tracks?: TimelineTrack[],
  forceOverwriteOldest: boolean = true,
): boolean {
  // Read-modify-write: use the structural loader, not the schema one. Rewriting
  // the list from schema-validated entries silently deletes every entry the
  // validator rejects, and under-counts the list so the "full" guard below
  // never fires. Same reasoning as `upsertRecentFlame`.
  const recent = loadRecentFlamesForRewrite()
  if (recent.length >= MAX_RECENT_FLAMES && !forceOverwriteOldest) {
    return false
  }
  const id = newRecentFlameId()
  const entry: RecentFlame = {
    id,
    name: name || flame.metadata?.name || 'Flame',
    flame: deepClone(flame),
    savedAt: Date.now(),
  }
  // Only store tracks when there are actual keyframes
  if (tracks && tracks.length > 0) {
    entry.tracks = deepClone(tracks)
  }
  const updated = [entry, ...recent].slice(0, MAX_RECENT_FLAMES)
  safeSetItem(STORAGE_KEY, JSON.stringify(updated))
  return true
}

/**
 * Overwrite the stored list wholesale. Used by the backup importer, which
 * merges the imported entries with the existing ones (dropping duplicates)
 * before writing the result back in one go.
 * @returns false when the localStorage write failed.
 */
export function saveRecentFlames(entries: RecentFlame[]): boolean {
  return safeSetItem(
    STORAGE_KEY,
    JSON.stringify(entries.slice(0, MAX_RECENT_FLAMES)),
  )
}

/** Stored entries with only structural validation — no flame-schema pass.
 *  Used for read-modify-write cycles so a schema-validation regression can't
 *  make an automated rewrite (autosave runs one every interval) silently drop
 *  every entry the validator rejects. */
export function loadRecentFlamesForRewrite(): RecentFlame[] {
  try {
    const raw = safeGetItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidRecentFlame)
  } catch {
    return []
  }
}

/**
 * Insert-or-update a recent entry by id and move it to the front. Used by
 * autosave so one editing session keeps updating a single entry instead of
 * flooding the list; drops the oldest entry when the list is full.
 * @returns false when the localStorage write failed.
 */
export function upsertRecentFlame(
  id: string,
  flame: FlameDescriptor,
  name?: string,
  tracks?: TimelineTrack[],
): boolean {
  const recent = loadRecentFlamesForRewrite()
  const existing = recent.find((item) => item.id === id)
  const entry: RecentFlame = {
    id,
    name: name || flame.metadata?.name || existing?.name || 'Autosave',
    flame: deepClone(flame),
    savedAt: Date.now(),
  }
  if (tracks && tracks.length > 0) {
    entry.tracks = deepClone(tracks)
  }
  const updated = [entry, ...recent.filter((item) => item.id !== id)].slice(
    0,
    MAX_RECENT_FLAMES,
  )
  return safeSetItem(STORAGE_KEY, JSON.stringify(updated))
}

/** The oldest stored entry — the one a save would evict. Structural load only:
 *  the caller reads `name` for a confirm prompt, so a schema pass over the whole
 *  list would be wasted work, and a rejected entry is still a real entry that
 *  can be evicted. */
export function getOldestRecentFlame(): RecentFlame | undefined {
  const recent = loadRecentFlamesForRewrite()
  if (recent.length === 0) return undefined
  return recent[recent.length - 1]
}

/**
 * Compact date+time label for recent flames.
 * Returns e.g. "May 26, 14:30" or "Today, 14:30" / "Yesterday, 09:15"
 */
export function formatRecentDate(timestamp: number): string {
  const d = new Date(timestamp)
  const now = new Date()
  const hours = d.getHours().toString().padStart(2, '0')
  const mins = d.getMinutes().toString().padStart(2, '0')
  const time = `${hours}:${mins}`

  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()

  if (isToday) return `Today, ${time}`
  if (isYesterday) return `Yesterday, ${time}`

  const month = d.toLocaleDateString(undefined, { month: 'short' })
  const day = d.getDate()
  return `${month} ${day}, ${time}`
}

export function deleteRecentFlame(id: string): void {
  // Read-modify-write — structural loader only, so deleting one entry cannot
  // take every schema-rejected entry with it.
  const recent = loadRecentFlamesForRewrite()
  const filtered = recent.filter((item) => item.id !== id)
  safeSetItem(STORAGE_KEY, JSON.stringify(filtered))
}

export function clearRecentFlames(): void {
  safeRemoveItem(STORAGE_KEY)
}
