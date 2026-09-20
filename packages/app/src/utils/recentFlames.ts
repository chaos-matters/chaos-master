import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { TimelineSnapshotConfig } from '@/flame/schema/timeline'
import { deepClone } from '@/utils/clone'
import { safeGetItem, safeRemoveItem, safeSetItem } from '@/utils/storage'
import { clampTimelineConfig } from '@/utils/timeline'
import * as v from '@/valibot'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineConfig, TimelineTrack } from '@/utils/timeline'

const STORAGE_KEY = 'chaos-master-recent-flames'
export const MAX_RECENT_FLAMES = 150

/**
 * What a write to Recents did.
 *
 * `full` is the one a caller may resolve by asking the user, because the only
 * way to make room is to destroy an entry they chose to keep. Every other
 * refusal is `refused`: storage said no, and there is nothing to ask about.
 *
 * ONE RULE GOVERNS EVERY WRITER HERE: no write evicts a flame the user kept
 * unless the user was asked. The list is a shelf the user put things on; an
 * automatic write - the autosave's interval, a load boundary, a crash rescue
 * - is work they have not asked to keep, and pushing the oldest entry off the
 * end to store it destroys something irreplaceable to save something the app
 * can offer back anyway. `saveRecentFlame` takes the answer to that question
 * as `forceOverwriteOldest`, and it is the only way past the guard.
 */
export type RecentWriteOutcome = 'saved' | 'full' | 'refused'

export type RecentFlame = {
  id: string
  name: string
  flame: FlameDescriptor
  savedAt: number
  tracks?: TimelineTrack[]
  /**
   * The timeline the flame was last seen at: how fast it runs, how long it
   * is, whether it loops. Stored beside the tracks because it is not derived
   * from them - a flame with no keyframes still has a frame rate and an end
   * frame, and an entry that kept the tracks and dropped this came back at
   * the workspace's defaults, 30fps over 90 frames.
   *
   * Absent in every record written before this existed, which is why it is
   * optional and why nothing downstream may assume it.
   */
  config?: TimelineConfig
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

/** The shape of a timeline, with none of its limits.
 *
 *  Splitting the two is what lets an out-of-range config be repaired instead
 *  of thrown away: what this rejects is not a timeline at all - a string
 *  where the frame rate goes, a missing `loop` - and there is nothing to
 *  repair. Ranges are not checked here; `clampTimelineConfig` owns those, and
 *  it also rounds, so a stored `fps: 29.5` is a fixable value rather than a
 *  fatal one. */
const StoredTimelineShape = v.object({
  fps: v.pipe(v.number(), v.finite()),
  timeScale: v.pipe(v.number(), v.finite()),
  startFrame: v.pipe(v.number(), v.finite()),
  endFrame: v.pipe(v.number(), v.finite()),
  loop: v.boolean(),
  autoFps: v.optional(v.boolean()),
  loopMode: v.optional(v.picklist(['off', 'seamless', 'cycle'])),
})

/** The stored timeline, validated like the flame beside it. What it decides -
 *  the frame rate, the speed, the end frame - is what playback does, so a
 *  value from an older build or a hand-edited backup cannot be trusted
 *  straight in: `fps: 0` would stop the timeline dead.
 *
 *  A value merely past a limit is clamped rather than dropped. Dropping it
 *  took the whole config with it, so a flame stored before the clamp existed
 *  - a seamless loop pushes `endFrame` past the ceiling on its own
 *  (utils/timeline.ts) - came back at 30fps over 90 frames, silently, having
 *  been reported as saved. Only a config that is structurally unusable is
 *  dropped, and its entry kept, the way a flame that fails drops its entry. */
function parseStoredConfig(raw: unknown): TimelineConfig | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const result = v.safeParse(TimelineSnapshotConfig, raw)
  // Pinned at the call site: valibot's inferred output widens in ways that
  // differ between a local typecheck and CI.
  if (result.success) return result.output
  const loose = v.safeParse(StoredTimelineShape, raw)
  if (!loose.success) return undefined
  const { fps, timeScale, startFrame, endFrame, loop, autoFps, loopMode } =
    loose.output
  return clampTimelineConfig({
    fps,
    timeScale,
    startFrame,
    endFrame,
    loop,
    ...(autoFps === undefined ? {} : { autoFps }),
    ...(loopMode === undefined ? {} : { loopMode }),
  })
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

/** Dev-only tripwire for the read-only contract above. Sharing entries between
 *  callers is what makes the memo cheap, so a caller that mutates one instead of
 *  cloning would corrupt every later read — a bug that is invisible until some
 *  unrelated screen shows stale data. Freezing turns it into a throw at the
 *  mutation site. Paid once per distinct payload, and `import.meta.env.DEV` is
 *  statically false in production, so this whole path is dropped from the
 *  bundle. */
function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== 'object' || value === null) return value
  // Freezing a typed array with elements throws; stored flames are JSON so this
  // should not arise, but a dev-only guard must not be the thing that crashes.
  if (ArrayBuffer.isView(value)) return value
  if (seen.has(value)) return value
  seen.add(value)
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key], seen)
  }
  return Object.freeze(value)
}

export function loadRecentFlames(): RecentFlame[] {
  try {
    const raw = safeGetItem(STORAGE_KEY)
    if (raw === null) {
      validatedCache = undefined
      return []
    }
    if (validatedCache?.raw === raw) return [...validatedCache.entries]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const entries = parsed.filter(isValidRecentFlame).flatMap((item) => {
      const flame = tryValidateFlame(item.flame)
      if (!flame) return []
      const { config: stored, ...rest } = item
      const config = parseStoredConfig(stored)
      return [{ ...rest, flame, ...(config ? { config } : {}) }]
    })
    if (import.meta.env.DEV) entries.forEach((entry) => deepFreeze(entry))
    validatedCache = { raw, entries }
    return [...entries]
  } catch {
    return []
  }
}

/**
 * One entry, read exactly the way the Library reads the list it shows.
 *
 * Same validation as {@link loadRecentFlames}, over one entry instead of 150.
 * That pass costs about 90ms for a full list, and a caller that cares about a
 * single id - every writer, confirming its own write - should not pay it. The
 * memo is used when it is already warm, so a caller on a screen that has just
 * loaded the list pays nothing.
 *
 * Read-only, like every entry this module hands out: it can come from the
 * shared memo.
 */
export function loadRecentFlame(id: string): RecentFlame | undefined {
  try {
    const raw = safeGetItem(STORAGE_KEY)
    if (raw === null) return undefined
    if (validatedCache?.raw === raw) {
      return validatedCache.entries.find((entry) => entry.id === id)
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return undefined
    const item = parsed
      .filter(isValidRecentFlame)
      .find((entry) => entry.id === id)
    if (!item) return undefined
    const flame = tryValidateFlame(item.flame)
    if (!flame) return undefined
    const { config: stored, ...rest } = item
    const config = parseStoredConfig(stored)
    return { ...rest, flame, ...(config ? { config } : {}) }
  } catch {
    return undefined
  }
}

/**
 * Did the write land as something the Library can read, timeline and all?
 *
 * "Saved" is a claim about where the user's work is, and every caller acts on
 * it: Save for Later says so and marks the workspace clean, the autosave
 * resets its baseline, the draft rescue clears the slot that held the only
 * other copy. The loader keeps an entry whose config fails validation and
 * drops the config, so a flame could be stored while the timeline it was
 * authored at quietly was not - and nothing retried, because the write had
 * reported success.
 *
 * So a writer confirms its own write the way the Library will read it.
 */
function landedIntact(id: string, config?: TimelineConfig): boolean {
  const stored = loadRecentFlame(id)
  if (!stored) return false
  return config === undefined || stored.config !== undefined
}

export function saveRecentFlame(
  flame: FlameDescriptor,
  name?: string,
  tracks?: TimelineTrack[],
  /**
   * The user's own answer to "may this replace the oldest flame?". Defaults
   * to no: a caller that has not asked must not be able to evict by leaving
   * an argument out, which is how two export paths were quietly dropping the
   * oldest entry every time they saved the exported flame.
   */
  forceOverwriteOldest: boolean = false,
  config?: TimelineConfig,
): RecentWriteOutcome {
  // Read-modify-write: use the structural loader, not the schema one. Rewriting
  // the list from schema-validated entries silently deletes every entry the
  // validator rejects, and under-counts the list so the "full" guard below
  // never fires. Same reasoning as `upsertRecentFlame`.
  const recent = loadRecentFlamesForRewrite()
  if (recent.length >= MAX_RECENT_FLAMES && !forceOverwriteOldest) {
    return 'full'
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
  // The timeline goes in whether or not there are tracks: it is what says
  // how fast the flame runs and how long it is.
  if (config) entry.config = deepClone(config)
  const updated = [entry, ...recent].slice(0, MAX_RECENT_FLAMES)
  // Report the real outcome. This used to return `true` unconditionally, so a
  // write that failed on quota or in private mode still told the caller the
  // flame was saved — and the caller marks the workspace clean on success.
  if (!safeSetItem(STORAGE_KEY, JSON.stringify(updated))) return 'refused'
  return landedIntact(id, config) ? 'saved' : 'refused'
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
 * flooding the list.
 *
 * At the cap it declines rather than dropping the oldest entry. Nobody asks
 * the user before an autosave, so this write may not do what Save for Later
 * stops and asks about: at 150 kept flames, one crash restore and a single
 * keystroke used to delete the oldest of them with no prompt. Writing into an
 * id already on the list replaces that entry and grows nothing, so only a new
 * id can be refused.
 */
export function upsertRecentFlame(
  id: string,
  flame: FlameDescriptor,
  name?: string,
  tracks?: TimelineTrack[],
  config?: TimelineConfig,
  /**
   * The user's own answer to "may this replace the oldest flame?", the same
   * one `saveRecentFlame` takes. Defaults to no, so leaving it out cannot
   * evict anything. Two callers ever set it, and both have the answer: the
   * flush at a document replacement, which asked (lib/documentLoad.ts), and
   * the pagehide flush, which has nobody left to ask and a document about to
   * cease to exist (hooks/useWorkspaceAutosave.ts).
   */
  forceOverwriteOldest: boolean = false,
): RecentWriteOutcome {
  const recent = loadRecentFlamesForRewrite()
  const existing = recent.find((item) => item.id === id)
  if (!existing && recent.length >= MAX_RECENT_FLAMES && !forceOverwriteOldest)
    return 'full'
  const entry: RecentFlame = {
    id,
    name: name || flame.metadata?.name || existing?.name || 'Autosave',
    flame: deepClone(flame),
    savedAt: Date.now(),
  }
  if (tracks && tracks.length > 0) {
    entry.tracks = deepClone(tracks)
  }
  if (config) entry.config = deepClone(config)
  const updated = [entry, ...recent.filter((item) => item.id !== id)].slice(
    0,
    MAX_RECENT_FLAMES,
  )
  if (!safeSetItem(STORAGE_KEY, JSON.stringify(updated))) return 'refused'
  return landedIntact(id, config) ? 'saved' : 'refused'
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

/** @returns false when the localStorage write failed, so a caller can tell the
 *  user the entry is still there instead of silently leaving it on screen. */
export function deleteRecentFlame(id: string): boolean {
  // Read-modify-write — structural loader only, so deleting one entry cannot
  // take every schema-rejected entry with it.
  const recent = loadRecentFlamesForRewrite()
  const filtered = recent.filter((item) => item.id !== id)
  return safeSetItem(STORAGE_KEY, JSON.stringify(filtered))
}

export function clearRecentFlames(): void {
  safeRemoveItem(STORAGE_KEY)
}
