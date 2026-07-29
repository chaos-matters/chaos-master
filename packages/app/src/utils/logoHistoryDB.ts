import { createHistoryDB } from './createHistoryDB'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export interface HistoryEntry {
  id?: number
  flame: FlameDescriptor
  thumbnail: string // PNG data URL
  timestamp: number
}

const db = createHistoryDB<HistoryEntry>('chaos-master-logo-history')

/** Gallery cap kept by the Logo/Favicon generator card. */
export const MAX_LOGO_HISTORY = 50

export function loadHistoryEntries(maxCount: number): Promise<HistoryEntry[]> {
  return db.load(maxCount)
}

export function addHistoryEntry(
  entry: HistoryEntry,
  maxCount: number,
): Promise<HistoryEntry[]> {
  return db.add(entry, maxCount)
}

/** Bulk insert (backup import) — see {@link createHistoryDB} `addMany`. */
export function addHistoryEntries(
  entries: HistoryEntry[],
  maxCount: number = MAX_LOGO_HISTORY,
): Promise<HistoryEntry[]> {
  return db.addMany(entries, maxCount)
}

export function clearHistory(): Promise<void> {
  return db.clear()
}
