import Dexie from 'dexie'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export interface RandomizerHistoryEntry {
  id?: number
  flame: FlameDescriptor
  thumbnail: string // PNG data URL
  timestamp: number
}

class RandomizerHistoryDB extends Dexie {
  entries!: Dexie.Table<RandomizerHistoryEntry, number>

  constructor() {
    super('chaos-master-randomizer-history')
    this.version(1).stores({
      entries: '++id, timestamp',
    })
  }
}

const db = new RandomizerHistoryDB()

export function loadRandomizerHistoryEntries(
  maxCount: number,
): Promise<RandomizerHistoryEntry[]> {
  return db.entries.orderBy('timestamp').reverse().limit(maxCount).toArray()
}

export async function addRandomizerHistoryEntry(
  entry: RandomizerHistoryEntry,
  maxCount: number,
): Promise<RandomizerHistoryEntry[]> {
  await db.entries.add(entry)
  const all = await db.entries.orderBy('timestamp').reverse().toArray()
  const toDelete = all.slice(maxCount)
  if (toDelete.length > 0) {
    await db.entries.bulkDelete(toDelete.map((e) => e.id!))
  }
  return all.slice(0, maxCount)
}

export async function clearRandomizerHistory(): Promise<void> {
  await db.entries.clear()
}
