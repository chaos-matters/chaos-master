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
  /** Keep the loaded resource alive between openings without leaving its
   * panel in the layout or accessibility tree. */
  hidden?: boolean
}) {
  const [sessions, { mutate, refetch }] = createResource(
    () => props.revision,
    loadStoredSessions,
  )
  const [retrying, setRetrying] = createSignal(false)
  let closeButtonRef: HTMLButtonElement | undefined
  let retryButtonRef: HTMLButtonElement | undefined

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
  const [renamingId, setRenamingId] = createSignal<number>()

  const commitRename = async (entry: StoredSession, name: string) => {
    if (entry.id !== undefined && renamingId() === entry.id) return
    const trimmed = name.trim()
    if (entry.id === undefined || trimmed === '' || trimmed === entry.name) {
      setEditingId(undefined)
      return
    }
    setRenamingId(entry.id)
    try {
      mutate(await renameStoredSession(entry.id, trimmed))
    } catch (error: unknown) {
      console.warn('[recorder] could not rename recording', error)
    } finally {
      setRenamingId(undefined)
      setEditingId(undefined)
    }
  }

  const retryLoad = async () => {
    setRetrying(true)
    try {
      await refetch()
    } catch {
      // The resource exposes the error in-place; keeping it there also keeps
      // the Retry control mounted for a keyboard user.
    } finally {
      setRetrying(false)
      queueMicrotask(() => {
        if (props.hidden) return
        if (sessions.error) retryButtonRef?.focus()
        else closeButtonRef?.focus()
      })
    }
  }

  const restoreRenameFocus = (id: number | undefined) => {
    if (id === undefined) return
    queueMicrotask(() => {
      document
        .querySelector<HTMLButtonElement>(`[data-recording-rename="${id}"]`)
        ?.focus()
    })
  }

  const when = (timestamp: number) =>
    new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div
      id="session-recording-library"
      class={styles.panel}
      hidden={props.hidden}
    >
      <div class={styles.header}>
        <span class={styles.title}>Recordings</span>
        <button
          ref={closeButtonRef}
          type="button"
          class={styles.button}
          onClick={props.onClose}
        >
          Close
        </button>
      </div>

      <Show
        when={!sessions.loading || retrying()}
        fallback={
          <p class={styles.empty} role="status" aria-live="polite">
            Loading recordings…
          </p>
        }
      >
        <Show
          when={!sessions.error && !retrying()}
          fallback={
            <div class={styles.error} role="alert">
              <span>Recordings could not be loaded.</span>
              <button
                ref={retryButtonRef}
                type="button"
                class={styles.button}
                disabled={retrying()}
                aria-busy={retrying()}
                onClick={() => {
                  void retryLoad()
                }}
              >
                {retrying() ? 'Retrying…' : 'Retry'}
              </button>
            </div>
          }
        >
          <Show
            when={(sessions()?.length ?? 0) > 0}
            fallback={
              <p class={styles.empty}>
                No saved recordings yet. Start a recording, make some edits,
                then stop and save it.
              </p>
            }
          >
            <ul class={styles.list}>
              <For each={sessions()}>
                {(entry) => (
                  <li class={styles.entry}>
                    <div class={styles.entryMain}>
                      <Show
                        when={
                          editingId() !== undefined && editingId() === entry.id
                        }
                        fallback={
                          <button
                            type="button"
                            class={styles.entryName}
                            data-recording-rename={entry.id}
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
                          readOnly={renamingId() === entry.id}
                          aria-busy={renamingId() === entry.id}
                          aria-label={`Rename recording ${entry.name}`}
                          onBlur={(ev) => {
                            void commitRename(entry, ev.currentTarget.value)
                          }}
                          onKeyDown={(ev) => {
                            if (renamingId() === entry.id) return
                            if (ev.key === 'Enter') {
                              ev.preventDefault()
                              void commitRename(
                                entry,
                                ev.currentTarget.value,
                              ).then(() => {
                                restoreRenameFocus(entry.id)
                              })
                            }
                            if (ev.key === 'Escape') {
                              ev.preventDefault()
                              ev.currentTarget.value = entry.name
                              setEditingId(undefined)
                              restoreRenameFocus(entry.id)
                            }
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
        </Show>
      </Show>
    </div>
  )
}
