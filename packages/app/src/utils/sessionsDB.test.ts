import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { MAX_ACTION_NOTE_CHARS, SESSION_FORMAT_VERSION, } from '@/recorder/schema'
import { deepClone } from './clone'
import { loadStoredSessions, storeSession } from './sessionsDB'
import type { RecordedSession } from '@/recorder/schema'

function validSession(): RecordedSession {
  return {
    version: SESSION_FORMAT_VERSION,
    app: { version: 'test', flameSchemaVersion: 'test' },
    createdAt: '2026-08-14T12:00:00.000Z',
    initial: deepClone(examples.example1),
    actions: [{ t: 0, id: 'flame.setGamma', args: [2] }],
    unnamedWriteCount: 0,
  }
}

function rawDatabase() {
  const raw = new Dexie('chaos-master-sessions')
  raw.version(1).stores({ sessions: '++id, timestamp' })
  return raw
}

afterEach(async () => {
  const raw = rawDatabase()
  await raw.table('sessions').clear()
  raw.close()
})

describe('recording session persistence boundary', () => {
  it('stores a validated session and derives metadata from that value', async () => {
    const stored = await storeSession(validSession(), 'Bounded recording')

    expect(stored).toHaveLength(1)
    expect(stored[0]?.name).toBe('Bounded recording')
    expect(stored[0]?.actionCount).toBe(1)
    expect(stored[0]?.session.actions[0]?.id).toBe('flame.setGamma')
  })

  it('rejects an invalid session before writing to IndexedDB', async () => {
    const invalid = validSession()
    invalid.actions[0] = {
      ...invalid.actions[0]!,
      note: 'x'.repeat(MAX_ACTION_NOTE_CHARS + 1),
    }

    await expect(storeSession(invalid, 'Invalid')).rejects.toThrow(
      'Cannot store an invalid recording session',
    )
    await expect(loadStoredSessions()).resolves.toEqual([])
  })

  it('filters a forged legacy row when reading from IndexedDB', async () => {
    const invalid = validSession()
    invalid.actions[0] = {
      ...invalid.actions[0]!,
      note: 'x'.repeat(MAX_ACTION_NOTE_CHARS + 1),
    }
    const raw = rawDatabase()
    await raw.table('sessions').add({
      name: 'Forged recording',
      timestamp: Date.now(),
      actionCount: 1,
      unnamedWriteCount: 0,
      session: invalid,
    })
    raw.close()

    await expect(loadStoredSessions()).resolves.toEqual([])
  })
})
