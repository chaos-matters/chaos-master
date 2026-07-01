import { createHistoryDB } from './createHistoryDB'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export interface RandomizerHistoryEntry {
  id?: number
  flame: FlameDescriptor
  thumbnail: string // PNG data URL
  timestamp: number
}

const db = createHistoryDB<RandomizerHistoryEntry>(
  'chaos-master-randomizer-history',
)

export const MAX_RANDOMIZER_HISTORY_LIMIT = 150

export function loadRandomizerHistoryEntries(
  maxCount: number = MAX_RANDOMIZER_HISTORY_LIMIT,
): Promise<RandomizerHistoryEntry[]> {
  return db.load(maxCount)
}

export function addRandomizerHistoryEntry(
  entry: RandomizerHistoryEntry,
  maxCount: number = MAX_RANDOMIZER_HISTORY_LIMIT,
): Promise<RandomizerHistoryEntry[]> {
  return db.add(entry, maxCount)
}

export function clearRandomizerHistory(): Promise<void> {
  return db.clear()
}
