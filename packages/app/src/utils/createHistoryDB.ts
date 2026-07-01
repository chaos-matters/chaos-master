import Dexie from 'dexie'

/**
 * Minimal shape every history record must have: an auto-incremented `id` and a
 * `timestamp` used for ordering/pruning.
 */
export interface HistoryRecord {
  id?: number
  timestamp: number
}

/**
 * A single-table Dexie "capped history" store, factored out of the
 * byte-for-byte-duplicated logo/randomizer history modules. Keeps the newest
 * `maxCount` entries by `timestamp`, pruning older ones on insert.
 */
export function createHistoryDB<T extends HistoryRecord>(dbName: string) {
  class HistoryDB extends Dexie {
    entries!: Dexie.Table<T, number>

    constructor() {
      super(dbName)
      this.version(1).stores({
        entries: '++id, timestamp',
      })
    }
  }

  const db = new HistoryDB()

  function load(maxCount: number): Promise<T[]> {
    return db.entries.orderBy('timestamp').reverse().limit(maxCount).toArray()
  }

  async function add(entry: T, maxCount: number): Promise<T[]> {
    await db.entries.add(entry)
    const all = await db.entries.orderBy('timestamp').reverse().toArray()
    const toDelete = all.slice(maxCount)
    if (toDelete.length > 0) {
      await db.entries.bulkDelete(toDelete.map((e) => e.id!))
    }
    return all.slice(0, maxCount)
  }

  async function clear(): Promise<void> {
    await db.entries.clear()
  }

  return { load, add, clear }
}
