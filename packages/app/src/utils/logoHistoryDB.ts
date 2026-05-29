import Dexie from 'dexie'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export interface HistoryEntry {
  id?: number
  flame: FlameDescriptor
  thumbnail: string // PNG data URL
  timestamp: number
}

class LogoHistoryDB extends Dexie {
  entries!: Dexie.Table<HistoryEntry, number>

  constructor() {
    super('chaos-master-logo-history')
    this.version(1).stores({
      entries: '++id, timestamp',
    })
  }
}

const db = new LogoHistoryDB()

export function loadHistoryEntries(maxCount: number): Promise<HistoryEntry[]> {
  return db.entries.orderBy('timestamp').reverse().limit(maxCount).toArray()
}

export async function addHistoryEntry(
  entry: HistoryEntry,
  maxCount: number,
): Promise<HistoryEntry[]> {
  await db.entries.add(entry)
  const all = await db.entries.orderBy('timestamp').reverse().toArray()
  const toDelete = all.slice(maxCount)
  if (toDelete.length > 0) {
    await db.entries.bulkDelete(toDelete.map((e) => e.id!))
  }
  return all.slice(0, maxCount)
}

export async function clearHistory(): Promise<void> {
  await db.entries.clear()
}
