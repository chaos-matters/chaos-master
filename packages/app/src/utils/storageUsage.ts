import { clearHistory, loadHistoryEntries } from './logoHistoryDB'
import { clearRandomizerHistory, loadRandomizerHistoryEntries, } from './randomizerHistoryDB'
import { clearRecentFlames, loadRecentFlames } from './recentFlames'

/** localStorage prefix shared by persistent settings and recent flames. */
const LS_PREFIX = 'chaos-master-'
/** Recent flames live under this key — counted as flame data, not settings. */
const RECENT_FLAMES_KEY = 'chaos-master-recent-flames'
/** Effectively "all" — histories are capped well below this. */
const ALL = 1_000_000

export type StorageBucket = { count: number; bytes: number }

export type StorageUsage = {
  /** Persistent UI/preferences (localStorage, excluding recent flames). */
  settings: StorageBucket
  recentFlames: StorageBucket
  /** Flame Randomizer history (IndexedDB). */
  generatedHistory: StorageBucket
  /** Logo/Favicon generator history (IndexedDB). */
  logoHistory: StorageBucket
  totalBytes: number
}

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length
}

/** All app settings keys in localStorage (everything but the recent flames). */
function settingsKeys(): string[] {
  const keys: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k !== null && k.startsWith(LS_PREFIX) && k !== RECENT_FLAMES_KEY) {
        keys.push(k)
      }
    }
  } catch {
    // localStorage unavailable (private mode) — nothing to report.
  }
  return keys
}

function localStorageBucket(keys: string[]): StorageBucket {
  let bytes = 0
  for (const k of keys) {
    let v = ''
    try {
      v = localStorage.getItem(k) ?? ''
    } catch {
      v = ''
    }
    bytes += utf8Bytes(k) + utf8Bytes(v)
  }
  return { count: keys.length, bytes }
}

function idbBucket(entries: unknown[]): StorageBucket {
  let bytes = 0
  for (const e of entries) {
    bytes += utf8Bytes(JSON.stringify(e))
  }
  return { count: entries.length, bytes }
}

export async function computeStorageUsage(): Promise<StorageUsage> {
  const settings = localStorageBucket(settingsKeys())

  let recentRaw = ''
  try {
    recentRaw = localStorage.getItem(RECENT_FLAMES_KEY) ?? ''
  } catch {
    recentRaw = ''
  }
  const recentFlames: StorageBucket = {
    count: loadRecentFlames().length,
    bytes:
      recentRaw === ''
        ? 0
        : utf8Bytes(RECENT_FLAMES_KEY) + utf8Bytes(recentRaw),
  }

  const [gen, logo] = await Promise.all([
    loadRandomizerHistoryEntries(ALL).catch(() => []),
    loadHistoryEntries(ALL).catch(() => []),
  ])
  const generatedHistory = idbBucket(gen)
  const logoHistory = idbBucket(logo)

  const totalBytes =
    settings.bytes +
    recentFlames.bytes +
    generatedHistory.bytes +
    logoHistory.bytes

  return { settings, recentFlames, generatedHistory, logoHistory, totalBytes }
}

/** Remove all persisted settings (keeps flame data). Returns what was cleared. */
export function clearSettings(): StorageBucket {
  const keys = settingsKeys()
  const bucket = localStorageBucket(keys)
  for (const k of keys) {
    try {
      localStorage.removeItem(k)
    } catch {
      // ignore
    }
  }
  return bucket
}

/** Remove every stored flame: recents + generated + logo histories. */
export async function clearAllFlames(): Promise<{
  recentFlames: StorageBucket
  generatedHistory: StorageBucket
  logoHistory: StorageBucket
}> {
  const usage = await computeStorageUsage()
  clearRecentFlames()
  await clearRandomizerHistory().catch(() => undefined)
  await clearHistory().catch(() => undefined)
  return {
    recentFlames: usage.recentFlames,
    generatedHistory: usage.generatedHistory,
    logoHistory: usage.logoHistory,
  }
}
