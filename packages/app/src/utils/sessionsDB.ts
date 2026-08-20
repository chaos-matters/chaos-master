import Dexie from 'dexie'
import { validateSession } from '@/recorder/schema'
import type { RecordedSession } from '@/recorder/schema'

/**
 * Saved step recordings (semantic-recorder-plan, M5).
 *
 * Its own Dexie store rather than `createHistoryDB` because a session library
 * needs per-entry delete and rename, which that capped-history factory does
 * not expose — it only loads, appends and clears wholesale. IndexedDB rather
 * than localStorage because a session embeds a whole flame plus every action;
 * `recentFlames` shares a single localStorage quota with the user's saved
 * work and must not compete with recordings for it.
 */

export type StoredSession = {
  id?: number
  name: string
  timestamp: number
  /** Denormalised so the list renders without decoding every session. */
  actionCount: number
  unnamedWriteCount: number
  session: RecordedSession
}

/** Recordings are small next to flames, but the store is still capped so it
 *  cannot grow without bound across a long project. */
export const MAX_STORED_SESSIONS = 100

export type ImportedSessionResult = {
  added: boolean
  /** The existing entry's name when an identical take was already stored. */
  name: string
}

class SessionsDatabase extends Dexie {
  sessions!: Dexie.Table<StoredSession, number>

  constructor() {
    super('chaos-master-sessions')
    this.version(1).stores({ sessions: '++id, timestamp' })
  }
}

const db = new SessionsDatabase()

function validatedStoredSessions(rows: StoredSession[]): StoredSession[] {
  return rows.flatMap((row) => {
    const session = validateSession(row.session)
    return session === undefined
      ? []
      : [
          {
            ...row,
            actionCount: session.actions.length,
            unnamedWriteCount: session.unnamedWriteCount,
            session,
          },
        ]
  })
}

async function pruneStoredSessions() {
  const all = await db.sessions.orderBy('timestamp').reverse().toArray()
  const surplus = all.slice(MAX_STORED_SESSIONS)
  if (surplus.length > 0) {
    await db.sessions.bulkDelete(surplus.flatMap((e) => (e.id ? [e.id] : [])))
  }
}

async function addStoredSession(session: RecordedSession, name: string) {
  await db.sessions.add({
    name,
    timestamp: Date.now(),
    actionCount: session.actions.length,
    unnamedWriteCount: session.unnamedWriteCount,
    session,
  })
  await pruneStoredSessions()
}

/** Newest first. */
export async function loadStoredSessions(): Promise<StoredSession[]> {
  const rows = await db.sessions
    .orderBy('timestamp')
    .reverse()
    .limit(MAX_STORED_SESSIONS)
    .toArray()
  return validatedStoredSessions(rows)
}

export async function storeSession(
  session: RecordedSession,
  name: string,
): Promise<StoredSession[]> {
  // IndexedDB is a persistence boundary, not a trusted in-memory cache. Do
  // not retain a forged/oversized object that the app could never import or
  // replay after reload.
  const validated = validateSession(session)
  if (validated === undefined) {
    throw new Error('Cannot store an invalid recording session')
  }
  await db.transaction('rw', db.sessions, async () => {
    await addStoredSession(validated, name)
  })
  return loadStoredSessions()
}

/**
 * Imports a recording without filling the library with duplicates when the
 * same file is opened more than once. The comparison uses the fully validated
 * session value, so caption edits and other authored changes remain distinct
 * recordings even when they share the same creation timestamp.
 */
export async function storeImportedSession(
  session: RecordedSession,
  sourceFileName: string,
): Promise<ImportedSessionResult> {
  const validated = validateSession(session)
  if (validated === undefined) {
    throw new Error('Cannot import an invalid recording session')
  }

  const encoded = JSON.stringify(validated)
  const importedName = importedSessionName(sourceFileName, validated)
  let added = false
  let resolvedName = importedName

  // The read and conditional add share one IndexedDB transaction, so two
  // simultaneous drops of the same take cannot race into duplicate rows.
  await db.transaction('rw', db.sessions, async () => {
    const rows = await db.sessions
      .orderBy('timestamp')
      .reverse()
      .limit(MAX_STORED_SESSIONS)
      .toArray()
    // Creation time and the cheap denormalised counters reduce an exact
    // compare to the handful of plausible matches. Avoid serialising every
    // potentially multi-megabyte take in a full library on each import.
    const existing = validatedStoredSessions(rows)
      .filter(
        (entry) =>
          entry.session.createdAt === validated.createdAt &&
          entry.actionCount === validated.actions.length &&
          entry.unnamedWriteCount === validated.unnamedWriteCount,
      )
      .find((entry) => JSON.stringify(entry.session) === encoded)
    if (existing) {
      resolvedName = existing.name
      return
    }

    await addStoredSession(validated, importedName)
    added = true
  })

  return {
    added,
    name: resolvedName,
  }
}

export function importedSessionName(
  sourceFileName: string,
  session: RecordedSession,
): string {
  const stem = sourceFileName
    .trim()
    .replace(/\.steps\.json$/i, '')
    .replace(/\.(?:json|png|mp4)$/i, '')
    .trim()
  if (stem !== '') return stem

  const flameName = session.initial.metadata?.name?.trim()
  if (flameName) return flameName

  return `Recording ${session.createdAt.slice(0, 16).replace('T', ' ')}`
}

export async function deleteStoredSession(
  id: number,
): Promise<StoredSession[]> {
  await db.sessions.delete(id)
  return loadStoredSessions()
}

export async function renameStoredSession(
  id: number,
  name: string,
): Promise<StoredSession[]> {
  await db.sessions.update(id, { name })
  return loadStoredSessions()
}
