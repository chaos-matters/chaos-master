import Dexie from 'dexie'
import { validateBenchmarkManifest, validateBenchmarkResult, } from './validation'
import type { BenchmarkManifestV1, BenchmarkResultV1, BenchmarkRunStatus, } from './model'

export const MAX_BENCHMARK_RESULT_HISTORY = 100
const DEFAULT_DATABASE_NAME = 'chaos-master-benchmark-results'

export interface BenchmarkResultHistoryEntry {
  readonly id: string
  readonly savedAt: number
  readonly manifestId: string
  readonly status: BenchmarkRunStatus
  readonly manifest: BenchmarkManifestV1
  readonly result: BenchmarkResultV1
}

export interface BenchmarkResultHistoryFilter {
  readonly limit?: number
  readonly manifestId?: string
  readonly status?: BenchmarkRunStatus
}

export interface CreateBenchmarkResultStoreOptions {
  readonly dbName?: string
  readonly maxEntries?: number
}

export interface SaveBenchmarkResultOptions {
  readonly savedAt?: number
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`)
  }
}

export function createBenchmarkResultStore(
  options: CreateBenchmarkResultStoreOptions = {},
) {
  const dbName = options.dbName ?? DEFAULT_DATABASE_NAME
  const maxEntries = options.maxEntries ?? MAX_BENCHMARK_RESULT_HISTORY
  if (dbName.trim().length === 0) {
    throw new RangeError('dbName must not be empty')
  }
  assertPositiveSafeInteger(maxEntries, 'maxEntries')

  class BenchmarkResultDatabase extends Dexie {
    entries!: Dexie.Table<BenchmarkResultHistoryEntry, string>

    constructor() {
      super(dbName)
      this.version(1).stores({
        entries: '&id, savedAt, manifestId, status',
      })
    }
  }

  const db = new BenchmarkResultDatabase()

  async function list(
    filter: BenchmarkResultHistoryFilter = {},
  ): Promise<BenchmarkResultHistoryEntry[]> {
    const limit = filter.limit ?? maxEntries
    assertPositiveSafeInteger(limit, 'limit')
    const newestFirst = await db.entries.orderBy('savedAt').reverse().toArray()
    return newestFirst
      .filter(
        (entry) =>
          (filter.manifestId === undefined ||
            entry.manifestId === filter.manifestId) &&
          (filter.status === undefined || entry.status === filter.status),
      )
      .slice(0, limit)
  }

  function get(id: string): Promise<BenchmarkResultHistoryEntry | undefined> {
    return db.entries.get(id)
  }

  async function save(
    manifest: BenchmarkManifestV1,
    result: BenchmarkResultV1,
    saveOptions: SaveBenchmarkResultOptions = {},
  ): Promise<BenchmarkResultHistoryEntry> {
    const manifestValidation = validateBenchmarkManifest(manifest)
    if (manifestValidation.status === 'invalid') {
      throw new TypeError('Cannot store an invalid benchmark manifest')
    }
    const resultValidation = validateBenchmarkResult(result, manifest)
    if (resultValidation.status === 'invalid') {
      throw new TypeError('Cannot store an invalid benchmark result')
    }
    if (result.manifestId !== manifest.id) {
      throw new RangeError('Result and manifest ids do not match')
    }

    const savedAt = saveOptions.savedAt ?? Date.now()
    if (!Number.isSafeInteger(savedAt) || savedAt < 0) {
      throw new RangeError('savedAt must be a non-negative safe integer')
    }
    const entry: BenchmarkResultHistoryEntry = {
      id: result.id,
      savedAt,
      manifestId: manifest.id,
      status: result.status,
      manifest,
      result,
    }

    await db.transaction('rw', db.entries, async () => {
      await db.entries.put(entry)
      const staleIds = await db.entries
        .orderBy('savedAt')
        .reverse()
        .offset(maxEntries)
        .primaryKeys()
      if (staleIds.length > 0) {
        await db.entries.bulkDelete(staleIds)
      }
    })
    return entry
  }

  function remove(id: string): Promise<void> {
    return db.entries.delete(id)
  }

  function clear(): Promise<void> {
    return db.entries.clear()
  }

  function close(): void {
    db.close()
  }

  function deleteDatabase(): Promise<void> {
    return db.delete()
  }

  return {
    list,
    get,
    save,
    remove,
    clear,
    close,
    deleteDatabase,
  }
}

const benchmarkResultStore = createBenchmarkResultStore()

export function loadBenchmarkResultHistory(
  filter?: BenchmarkResultHistoryFilter,
): Promise<BenchmarkResultHistoryEntry[]> {
  return benchmarkResultStore.list(filter)
}

export function getBenchmarkResultHistoryEntry(
  id: string,
): Promise<BenchmarkResultHistoryEntry | undefined> {
  return benchmarkResultStore.get(id)
}

export function saveBenchmarkResult(
  manifest: BenchmarkManifestV1,
  result: BenchmarkResultV1,
  options?: SaveBenchmarkResultOptions,
): Promise<BenchmarkResultHistoryEntry> {
  return benchmarkResultStore.save(manifest, result, options)
}

export function deleteBenchmarkResult(id: string): Promise<void> {
  return benchmarkResultStore.remove(id)
}

export function clearBenchmarkResultHistory(): Promise<void> {
  return benchmarkResultStore.clear()
}
