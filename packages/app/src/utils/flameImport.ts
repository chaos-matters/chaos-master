import { unzipSync } from 'fflate'
import { isFlameXmlContent, parseFlameXml, registerImportedFlamePalette, } from '@/flame/flameXml'
import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { TimelineTrack } from '@/flame/schema/timeline'
import * as v from '@/valibot'
import { blobToBase64 } from './blob'
import { extractFlameFromPng } from './flameInPng'
import { addHistoryEntries, loadHistoryEntries, MAX_LOGO_HISTORY, } from './logoHistoryDB'
import { addRandomizerHistoryEntries, loadRandomizerHistoryEntries, MAX_RANDOMIZER_HISTORY_LIMIT, } from './randomizerHistoryDB'
import { loadRecentFlamesForRewrite, MAX_RECENT_FLAMES, newRecentFlameId, saveRecentFlames, } from './recentFlames'
import type { BackupGroups } from './flameBackup'
import type { RecentFlame } from './recentFlames'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/** Effectively "all" — every store is capped well below this. */
const ALL = 1_000_000

/** Same guard as the single-file loader: catch an accidental multi-GB drop
 *  before reading the whole thing into memory. */
export const MAX_IMPORT_FILE_SIZE = 500 * 1024 * 1024

export const ALL_BACKUP_GROUPS: BackupGroups = {
  recents: true,
  generated: true,
  logo: true,
}

/** Where an imported flame is stored — mirrors the backup's folders. */
export type ImportGroup = 'recents' | 'generated' | 'logo'

/** A flame recovered from a file, with everything needed to store it. */
export type ImportCandidate = {
  group: ImportGroup
  name: string
  flame: FlameDescriptor
  savedAt: number
  tracks?: TimelineTrack[]
  /** PNG data URL. History galleries are plain `<img>` tiles, so a
   *  generated/logo flame that arrives without one (a JSON-only backup) is
   *  routed to Recent flames instead, which renders its own live preview. */
  thumbnail?: string
}

export type ParsedImport = {
  candidates: ImportCandidate[]
  /** Files/entries that were found but could not be read or validated. */
  failed: number
}

export type ImportOutcome = {
  added: number
  duplicates: number
  /** Dropped because the destination is already at its cap. */
  skippedFull: number
}

export type ImportSummary = {
  recents: ImportOutcome
  generated: ImportOutcome
  logo: ImportOutcome
  failed: number
}

/** Flame plus the metadata its envelope carried, before it becomes an entry. */
type ParsedFlame = {
  flame: FlameDescriptor
  name?: string
  savedAt?: number
  tracks?: TimelineTrack[]
}

/** Top-level backup folder -> destination store. */
const ZIP_FOLDER_GROUPS: Record<string, ImportGroup> = {
  'recent-flames': 'recents',
  generated: 'generated',
  logo: 'logo',
}

const MANIFEST_PATH = 'manifest.json'

function emptyOutcome(): ImportOutcome {
  return { added: 0, duplicates: 0, skippedFull: 0 }
}

export function emptyImportSummary(): ImportSummary {
  return {
    recents: emptyOutcome(),
    generated: emptyOutcome(),
    logo: emptyOutcome(),
    failed: 0,
  }
}

// ── Parsing ────────────────────────────────────────────────────────────────

/** Keyframe tracks ride along with a flame — validate them against the
 *  timeline schema so a hand-edited file can't inject junk into the timeline. */
function parseTracks(raw: unknown): TimelineTrack[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const result = v.safeParse(v.array(TimelineTrack), raw)
  return result.success ? result.output : undefined
}

/**
 * Read the flame out of any envelope the app writes: a bare descriptor
 * (`{metadata, renderSettings, transforms}`), a share/animation payload
 * (`{flame, animation}`), or a recent-flame backup record (which adds `name`
 * and `savedAt`). Returns undefined when nothing schema-valid is in there.
 */
export function parseFlameEnvelope(raw: unknown): ParsedFlame | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined
  }
  const envelope = raw as Record<string, unknown>
  const flame = tryValidateFlame(
    'transforms' in envelope ? envelope : envelope.flame,
  )
  if (!flame) return undefined

  const parsed: ParsedFlame = { flame }
  if (typeof envelope.name === 'string' && envelope.name !== '') {
    parsed.name = envelope.name
  }
  if (typeof envelope.savedAt === 'number') {
    parsed.savedAt = envelope.savedAt
  }
  const animation = envelope.animation as { tracks?: unknown } | undefined
  const tracks = parseTracks(animation?.tracks)
  if (tracks) parsed.tracks = tracks
  return parsed
}

/** JSON descriptor/payload or Apophysis `.flame` XML — whichever the text is. */
function readFlameText(text: string): ParsedFlame | undefined {
  if (isFlameXmlContent(text)) {
    try {
      const flame = parseFlameXml(text)
      // Keep the file's gradient in the palette library, exactly like the
      // single-file import does.
      registerImportedFlamePalette(text)
      return { flame }
    } catch (err) {
      console.warn(err)
      return undefined
    }
  }
  try {
    return parseFlameEnvelope(JSON.parse(text))
  } catch (_) {
    return undefined
  }
}

/** The flame the app embeds in every exported PNG (zlib `zTXt`/`FlameJson`). */
async function readFlamePng(
  bytes: Uint8Array,
): Promise<ParsedFlame | undefined> {
  try {
    const result = await extractFlameFromPng(bytes)
    const parsed: ParsedFlame = { flame: result.flame }
    const tracks = parseTracks(result.animation?.tracks)
    if (tracks) parsed.tracks = tracks
    return parsed
  } catch (_) {
    return undefined
  }
}

/** History tiles are plain `<img>` elements — they need the image inline. */
async function pngDataUrl(bytes: Uint8Array): Promise<string | undefined> {
  try {
    // Copy into a fresh ArrayBuffer-backed view so the Blob types cleanly.
    const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' })
    return `data:image/png;base64,${await blobToBase64(blob)}`
  } catch (_) {
    return undefined
  }
}

function toCandidate(
  parsed: ParsedFlame,
  group: ImportGroup,
  fallbackSavedAt: number,
  thumbnail?: string,
): ImportCandidate {
  const candidate: ImportCandidate = {
    group,
    name: parsed.name || parsed.flame.metadata?.name || 'Flame',
    flame: parsed.flame,
    savedAt: parsed.savedAt ?? fallbackSavedAt,
  }
  if (parsed.tracks) candidate.tracks = parsed.tracks
  if (thumbnail !== undefined) candidate.thumbnail = thumbnail
  return candidate
}

/** Anything outside the backup's own folders (a zip the user assembled by
 *  hand) counts as a plain flame and lands in Recent flames. */
function zipEntryGroup(path: string): ImportGroup {
  const slash = path.indexOf('/')
  const folder = slash === -1 ? '' : path.slice(0, slash)
  return ZIP_FOLDER_GROUPS[folder] ?? 'recents'
}

type ZipMember = { group: ImportGroup; json?: Uint8Array; png?: Uint8Array }

/**
 * Read a backup ZIP produced by `buildFlameBackupZip` back into candidates.
 * Members are paired by folder + file stem, so the `.json` descriptor and the
 * `.png` (which carries the gallery thumbnail) of one history flame become a
 * single candidate rather than two.
 *
 * Individual unreadable members are counted, never fatal — a truncated or
 * hand-edited archive still restores everything that parses. Only a ZIP whose
 * central directory is unreadable throws, and the caller reports that.
 */
export async function parseBackupZip(
  bytes: Uint8Array,
  groups: BackupGroups = ALL_BACKUP_GROUPS,
): Promise<ParsedImport> {
  const unzipped = unzipSync(bytes)
  const members = new Map<string, ZipMember>()

  for (const [path, data] of Object.entries(unzipped)) {
    // Directory markers carry no payload; the manifest is metadata, not a flame.
    if (data.length === 0 || path.endsWith('/') || path === MANIFEST_PATH) {
      continue
    }
    const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
    if (extension !== 'json' && extension !== 'png') continue
    const group = zipEntryGroup(path)
    if (!groups[group]) continue
    const stem = path.slice(0, path.lastIndexOf('.'))
    const member = members.get(stem) ?? { group }
    member[extension === 'json' ? 'json' : 'png'] = data
    members.set(stem, member)
  }

  const candidates: ImportCandidate[] = []
  let failed = 0
  // History flames are exported without their timestamp, so stamp them in
  // archive order (newest first, as the export writes them) to keep the
  // gallery ordering the backup was taken with.
  const now = Date.now()
  let index = 0

  for (const member of members.values()) {
    const thumbnail = member.png ? await pngDataUrl(member.png) : undefined
    const parsed =
      (member.json ? readFlameText(decodeText(member.json)) : undefined) ??
      (member.png ? await readFlamePng(member.png) : undefined)
    if (!parsed) {
      failed++
      continue
    }
    candidates.push(toCandidate(parsed, member.group, now - index, thumbnail))
    index++
  }

  return { candidates, failed }
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

/**
 * Read dropped or picked files into import candidates. Exported PNGs (the
 * embedded flame chunk), JSON descriptors, `.flame`/`.xml` configs and whole
 * backup ZIPs are all accepted; every file is tried as a PNG first and as text
 * second, so a renamed extension still loads. Anything unreadable is counted,
 * so one bad file cannot sink the batch.
 *
 * Everything that is not a ZIP is a plain flame and lands in Recent flames.
 */
export async function readFlameFiles(
  files: File[],
  groups: BackupGroups = ALL_BACKUP_GROUPS,
): Promise<ParsedImport> {
  const candidates: ImportCandidate[] = []
  let failed = 0
  const now = Date.now()
  let index = 0

  for (const file of files) {
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      failed++
      continue
    }
    if (file.name.toLowerCase().endsWith('.zip')) {
      const archive = await readBackupFile(file, groups)
      if (!archive) {
        failed++
        continue
      }
      candidates.push(...archive.candidates)
      failed += archive.failed
      continue
    }
    const parsed = await readFlameFile(file)
    if (!parsed) {
      failed++
      continue
    }
    // Preserve drop order: the first file is the newest entry.
    candidates.push(toCandidate(parsed, 'recents', now - index))
    index++
  }

  return { candidates, failed }
}

async function readBackupFile(
  file: File,
  groups: BackupGroups,
): Promise<ParsedImport | undefined> {
  try {
    return await parseBackupZip(
      new Uint8Array(await file.arrayBuffer()),
      groups,
    )
  } catch (err) {
    console.warn(err)
    return undefined
  }
}

async function readFlameFile(file: File): Promise<ParsedFlame | undefined> {
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch (err) {
    console.warn(err)
    return undefined
  }
  return (await readFlamePng(bytes)) ?? readFlameText(decodeText(bytes))
}

// ── Merging ────────────────────────────────────────────────────────────────

/** Key-order-independent JSON, so two descriptors that differ only in the
 *  order their keys were written still compare equal. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null'
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
  return `{${entries.join(',')}}`
}

/**
 * Identity of a stored flame. Both sides go through the schema first so an
 * entry saved before a default was added still matches the same flame coming
 * back from a backup (validation fills the default on both).
 */
export function flameSignature(flame: FlameDescriptor, name = ''): string {
  return `${name}\0${stableStringify(tryValidateFlame(flame) ?? flame)}`
}

/**
 * Merge candidates into the stored recent flames.
 *
 * Duplicates are SKIPPED, never overwritten or suffixed: a candidate whose
 * name and descriptor already match a stored entry (or an earlier candidate in
 * the same batch) is counted and dropped, so re-importing a backup is a no-op
 * instead of a second copy of everything. Existing entries are never evicted
 * either — once the list is at MAX_RECENT_FLAMES the rest of the batch is
 * reported as skipped rather than pushing the user's own saves out.
 */
export function mergeRecentFlames(
  existing: RecentFlame[],
  candidates: ImportCandidate[],
  makeId: () => string = newRecentFlameId,
): { entries: RecentFlame[]; outcome: ImportOutcome } {
  const seen = new Set(
    existing.map((entry) => flameSignature(entry.flame, entry.name)),
  )
  const outcome = emptyOutcome()
  const added: RecentFlame[] = []

  for (const candidate of candidates) {
    const signature = flameSignature(candidate.flame, candidate.name)
    if (seen.has(signature)) {
      outcome.duplicates++
      continue
    }
    if (existing.length + added.length >= MAX_RECENT_FLAMES) {
      outcome.skippedFull++
      continue
    }
    seen.add(signature)
    const entry: RecentFlame = {
      id: makeId(),
      name: candidate.name,
      flame: candidate.flame,
      savedAt: candidate.savedAt,
    }
    if (candidate.tracks && candidate.tracks.length > 0) {
      entry.tracks = candidate.tracks
    }
    added.push(entry)
    outcome.added++
  }

  // The list is rendered in stored order — keep it newest first.
  const entries = [...existing, ...added].sort((a, b) => b.savedAt - a.savedAt)
  return { entries, outcome }
}

/** The shape both history stores share (their `id` is assigned by Dexie). */
export type HistoryAddition = {
  flame: FlameDescriptor
  thumbnail: string
  timestamp: number
}

/**
 * Pick the candidates that can join a history store: same skip-duplicates rule
 * as the recents merge, and only up to the store's remaining capacity so
 * pruning can never delete an entry the user already had.
 */
export function mergeHistoryEntries(
  existing: HistoryAddition[],
  candidates: ImportCandidate[],
  maxCount: number,
): { additions: HistoryAddition[]; outcome: ImportOutcome } {
  const seen = new Set(existing.map((entry) => flameSignature(entry.flame)))
  const outcome = emptyOutcome()
  const additions: HistoryAddition[] = []

  for (const candidate of candidates) {
    // A history tile is an image — a candidate without one is not ours.
    if (candidate.thumbnail === undefined) continue
    const signature = flameSignature(candidate.flame)
    if (seen.has(signature)) {
      outcome.duplicates++
      continue
    }
    if (existing.length + additions.length >= maxCount) {
      outcome.skippedFull++
      continue
    }
    seen.add(signature)
    additions.push({
      flame: candidate.flame,
      thumbnail: candidate.thumbnail,
      timestamp: candidate.savedAt,
    })
    outcome.added++
  }

  return { additions, outcome }
}

/** Split candidates by destination store. Generated/logo flames that arrived
 *  without a thumbnail fall back to Recent flames — see {@link ImportCandidate}. */
export function splitByDestination(candidates: ImportCandidate[]): {
  recents: ImportCandidate[]
  generated: ImportCandidate[]
  logo: ImportCandidate[]
} {
  const hasImage = (c: ImportCandidate) => c.thumbnail !== undefined
  return {
    recents: candidates.filter((c) => c.group === 'recents' || !hasImage(c)),
    generated: candidates.filter((c) => c.group === 'generated' && hasImage(c)),
    logo: candidates.filter((c) => c.group === 'logo' && hasImage(c)),
  }
}

// ── Persisting ─────────────────────────────────────────────────────────────

/** Merge candidates into the stores they came from and report what happened. */
export async function applyFlameImport(
  candidates: ImportCandidate[],
): Promise<ImportSummary> {
  const summary = emptyImportSummary()
  const destinations = splitByDestination(candidates)

  if (destinations.recents.length > 0) {
    // Read structurally, not through the flame schema: this is a
    // read-modify-write of the whole list, and a validation regression must
    // not let an import quietly delete the entries the validator rejects.
    const merged = mergeRecentFlames(
      loadRecentFlamesForRewrite(),
      destinations.recents,
    )
    summary.recents = merged.outcome
    if (merged.outcome.added > 0 && !saveRecentFlames(merged.entries)) {
      // localStorage refused the write (quota) — nothing was stored, so report
      // the entries as failed instead of claiming an import that did not land.
      summary.failed += merged.outcome.added
      summary.recents = emptyOutcome()
    }
  }

  if (destinations.generated.length > 0) {
    const existing = await loadRandomizerHistoryEntries(ALL)
    const merged = mergeHistoryEntries(
      existing,
      destinations.generated,
      MAX_RANDOMIZER_HISTORY_LIMIT,
    )
    if (merged.additions.length > 0) {
      await addRandomizerHistoryEntries(
        merged.additions,
        MAX_RANDOMIZER_HISTORY_LIMIT,
      )
    }
    summary.generated = merged.outcome
  }

  if (destinations.logo.length > 0) {
    const existing = await loadHistoryEntries(ALL)
    const merged = mergeHistoryEntries(
      existing,
      destinations.logo,
      MAX_LOGO_HISTORY,
    )
    if (merged.additions.length > 0) {
      await addHistoryEntries(merged.additions, MAX_LOGO_HISTORY)
    }
    summary.logo = merged.outcome
  }

  return summary
}

// ── Reporting ──────────────────────────────────────────────────────────────

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** One-line toast text: what landed where, and what did not. */
export function summarizeImport(summary: ImportSummary): string {
  const groups = [
    { label: 'recent', outcome: summary.recents },
    { label: 'generated', outcome: summary.generated },
    { label: 'logo', outcome: summary.logo },
  ]
  const added = groups.reduce((sum, g) => sum + g.outcome.added, 0)
  const duplicates = groups.reduce((sum, g) => sum + g.outcome.duplicates, 0)
  const skippedFull = groups.reduce((sum, g) => sum + g.outcome.skippedFull, 0)

  if (added === 0 && duplicates === 0 && skippedFull === 0) {
    return summary.failed > 0
      ? `Could not read ${plural(summary.failed, 'file')}`
      : 'No flames found to import'
  }

  const filled = groups.filter((g) => g.outcome.added > 0)
  const where =
    filled.length > 1
      ? ` (${filled.map((g) => `${g.outcome.added} ${g.label}`).join(', ')})`
      : ''
  const parts = [`Imported ${plural(added, 'flame')}${where}`]
  if (duplicates > 0) parts.push(`skipped ${plural(duplicates, 'duplicate')}`)
  if (skippedFull > 0) parts.push(`${skippedFull} dropped (library full)`)
  if (summary.failed > 0) parts.push(`${summary.failed} unreadable`)
  return parts.join(', ')
}
