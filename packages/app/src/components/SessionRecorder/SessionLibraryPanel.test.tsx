/**
 * The saved-recordings list, read against a stubbed store: what each entry
 * says about the steps its take could not capture.
 */
import { render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/contexts/ToastContext'
import { examples } from '@/flame/examples'
import { SESSION_FORMAT_VERSION } from '@/recorder/schema'
import { deepClone } from '@/utils/clone'
import { SessionLibraryPanel } from './SessionLibraryPanel'
import type { RecordedSession } from '@/recorder/schema'
import type { StoredSession } from '@/utils/sessionsDB'

const { loadStoredSessionsMock } = vi.hoisted(() => ({
  loadStoredSessionsMock: vi.fn(),
}))

vi.mock('@/utils/sessionsDB', () => ({
  deleteStoredSession: vi.fn().mockResolvedValue([]),
  loadStoredSessions: loadStoredSessionsMock,
  renameStoredSession: vi.fn().mockResolvedValue([]),
}))

function storedTake(
  id: number,
  name: string,
  uncaptured: Pick<RecordedSession, 'unnamedWriteCount' | 'uncapturedSteps'>,
): StoredSession {
  const session: RecordedSession = {
    version: SESSION_FORMAT_VERSION,
    app: { version: 'test', flameSchemaVersion: '1.0' },
    createdAt: new Date(0).toISOString(),
    initial: deepClone(examples.example1),
    actions: [{ t: 0, id: 'flame.setGamma', args: [2] }],
    ...uncaptured,
  }
  return {
    id,
    name,
    timestamp: 0,
    actionCount: session.actions.length,
    unnamedWriteCount: session.unnamedWriteCount,
    session,
  }
}

afterEach(() => {
  loadStoredSessionsMock.mockReset()
})

describe('SessionLibraryPanel', () => {
  it('names the steps each saved take did not capture', async () => {
    loadStoredSessionsMock.mockResolvedValue([
      storedTake(1, 'Named take', {
        unnamedWriteCount: 1,
        uncapturedSteps: [
          {
            t: 43_000,
            reason: 'Undo of a change made before recording started',
          },
        ],
      }),
      storedTake(2, 'Older take', { unnamedWriteCount: 1 }),
      storedTake(3, 'Clean take', { unnamedWriteCount: 0 }),
    ])
    const { unmount } = render(() => (
      <ToastProvider>
        <SessionLibraryPanel
          revision={0}
          onReplay={() => {}}
          onClose={() => {}}
        />
      </ToastProvider>
    ))

    await waitFor(() => {
      expect(
        screen.getByText(
          'Undo of a change made before recording started, at 0:43',
        ),
      ).toBeTruthy()
    })
    expect(
      screen.getByText(
        'Details were not saved by the version that recorded it.',
      ),
    ).toBeTruthy()
    // One disclosure per take that has something to disclose.
    expect(screen.getAllByText('1 not captured')).toHaveLength(2)
    unmount()
  })
})
