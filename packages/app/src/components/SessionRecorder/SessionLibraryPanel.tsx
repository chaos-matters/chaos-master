import { createResource, createSignal, For, Show } from 'solid-js'
import { serializeSession, sessionFilename } from '@/recorder/schema'
import { downloadBlob } from '@/utils/blob'
import { deleteStoredSession, loadStoredSessions, renameStoredSession, } from '@/utils/sessionsDB'
import styles from './SessionLibraryPanel.module.css'
import type { RecordedSession } from '@/recorder/schema'
import type { StoredSession } from '@/utils/sessionsDB'

/**
 * The saved recordings (semantic-recorder-plan, M5). Stopping a recording
 * keeps it here rather than pushing a download at the user; downloading is
 * one of the things you can then do with it, alongside replaying it.
 */
export function SessionLibraryPanel(props: {
  /** Bumped by the host when a new recording is stored, to refetch. */
  revision: number
  onReplay: (session: RecordedSession) => void
  onClose: () => void
}) {
  const [sessions, { mutate }] = createResource(
    () => props.revision,
    loadStoredSessions,
  )

  const download = (entry: StoredSession) => {
    downloadBlob(
      new Blob([serializeSession(entry.session)], {
        type: 'application/json',
      }),
      sessionFilename(entry.name),
    )
  }

  const remove = (entry: StoredSession) => {
    if (entry.id === undefined) return
    void deleteStoredSession(entry.id).then(mutate)
  }

  // Recordings are named from the flame's title, or a timestamp when it has
  // none — neither of which says what the recording is, so the name is
  // editable in place: click it, type, Enter or blur to commit.
  const [editingId, setEditingId] = createSignal<number>()

  const commitRename = (entry: StoredSession, name: string) => {
    setEditingId(undefined)
    const trimmed = name.trim()
    if (entry.id === undefined || trimmed === '' || trimmed === entry.name) {
      return
    }
    void renameStoredSession(entry.id, trimmed).then(mutate)
  }

  const when = (timestamp: number) =>
    new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div class={styles.panel}>
      <div class={styles.header}>
        <span class={styles.title}>Recordings</span>
        <button type="button" class={styles.button} onClick={props.onClose}>
          Close
        </button>
      </div>

      <Show
        when={(sessions()?.length ?? 0) > 0}
        fallback={
          <p class={styles.empty}>
            No saved recordings yet. Press <strong>Record steps</strong>, make
            some edits, then <strong>Stop</strong>.
          </p>
        }
      >
        <ul class={styles.list}>
          <For each={sessions()}>
            {(entry) => (
              <li class={styles.entry}>
                <div class={styles.entryMain}>
                  <Show
                    when={editingId() !== undefined && editingId() === entry.id}
                    fallback={
                      <button
                        type="button"
                        class={styles.entryName}
                        onClick={() => {
                          setEditingId(entry.id)
                        }}
                        title="Rename this recording"
                      >
                        {entry.name}
                      </button>
                    }
                  >
                    <input
                      class={styles.entryRename}
                      value={entry.name}
                      autofocus
                      onBlur={(ev) => {
                        commitRename(entry, ev.currentTarget.value)
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') ev.currentTarget.blur()
                        if (ev.key === 'Escape') setEditingId(undefined)
                      }}
                    />
                  </Show>
                  <span class={styles.entryMeta}>
                    {when(entry.timestamp)} · {entry.actionCount} steps
                    <Show when={entry.unnamedWriteCount > 0}>
                      {' '}
                      <span
                        class={styles.warning}
                        title={`${entry.unnamedWriteCount} edit(s) were not captured as commands, so a replay cannot reproduce them.`}
                      >
                        · {entry.unnamedWriteCount} not captured
                      </span>
                    </Show>
                  </span>
                </div>
                <div class={styles.entryActions}>
                  <button
                    type="button"
                    class={styles.button}
                    onClick={() => {
                      props.onReplay(entry.session)
                    }}
                    title="Replay this recording"
                  >
                    Replay
                  </button>
                  <button
                    type="button"
                    class={styles.button}
                    onClick={() => {
                      download(entry)
                    }}
                    title="Download as .steps.json"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    class={styles.button}
                    onClick={() => {
                      remove(entry)
                    }}
                    title="Delete this recording"
                  >
                    Delete
                  </button>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  )
}
