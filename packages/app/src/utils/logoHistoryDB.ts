import { createHistoryDB } from './createHistoryDB'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export interface HistoryEntry {
  id?: number
  flame: FlameDescriptor
  thumbnail: string // PNG data URL
  timestamp: number
}

const db = createHistoryDB<HistoryEntry>('chaos-master-logo-history')

export function loadHistoryEntries(maxCount: number): Promise<HistoryEntry[]> {
  return db.load(maxCount)
}

export function addHistoryEntry(
  entry: HistoryEntry,
  maxCount: number,
): Promise<HistoryEntry[]> {
  return db.add(entry, maxCount)
}

export function clearHistory(): Promise<void> {
  return db.clear()
}
