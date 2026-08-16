import { describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { SESSION_FORMAT_VERSION } from '@/recorder/schema'
import { deepClone } from './clone'
import { snapshotExportSession } from './exportPreferences'
import type { RecordedSession } from '@/recorder/schema'

function recordedSession(name: string): RecordedSession {
  const initial = deepClone(examples.example1)
  initial.metadata = { ...initial.metadata, name }
  return {
    version: SESSION_FORMAT_VERSION,
    app: { version: 'test', flameSchemaVersion: 'test' },
    createdAt: '2026-08-16T12:00:00.000Z',
    initial,
    actions: [{ t: 0, id: 'flame.setGamma', args: [2] }],
    unnamedWriteCount: 0,
  }
}

describe('export session snapshots', () => {
  it('keeps the initiation-time recording after the current session changes', () => {
    const initiatedWith = recordedSession('Exported take')
    let currentSession: RecordedSession | undefined = initiatedWith

    const snapshot = snapshotExportSession(currentSession)

    currentSession = recordedSession('Later take')
    initiatedWith.initial.metadata.name = 'Mutated original'

    expect(snapshot).not.toBe(initiatedWith)
    expect(snapshot?.initial.metadata.name).toBe('Exported take')
    expect(currentSession.initial.metadata.name).toBe('Later take')
  })

  it('preserves an intentionally absent recording association', () => {
    expect(snapshotExportSession(undefined)).toBeUndefined()
  })
})
