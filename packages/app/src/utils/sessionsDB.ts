import Dexie from 'dexie'
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

class SessionsDatabase extends Dexie {
  sessions!: Dexie.Table<StoredSession, number>

  constructor() {
    super('chaos-master-sessions')
    this.version(1).stores({ sessions: '++id, timestamp' })
  }
}

const db = new SessionsDatabase()

/** Newest first. */
export function loadStoredSessions(): Promise<StoredSession[]> {
  return db.sessions
    .orderBy('timestamp')
    .reverse()
    .limit(MAX_STORED_SESSIONS)
    .toArray()
}

export async function storeSession(
  session: RecordedSession,
  name: string,
): Promise<StoredSession[]> {
  await db.sessions.add({
    name,
    timestamp: Date.now(),
    actionCount: session.actions.length,
    unnamedWriteCount: session.unnamedWriteCount,
    session,
  })
  const all = await db.sessions.orderBy('timestamp').reverse().toArray()
  const surplus = all.slice(MAX_STORED_SESSIONS)
  if (surplus.length > 0) {
    await db.sessions.bulkDelete(surplus.flatMap((e) => (e.id ? [e.id] : [])))
  }
  return all.slice(0, MAX_STORED_SESSIONS)
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
