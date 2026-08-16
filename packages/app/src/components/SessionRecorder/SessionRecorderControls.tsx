import { Show } from 'solid-js'
import { useToast } from '@/contexts/ToastContext'
import { Book, FolderOpen, Record } from '@/icons'
import { cancelSessionRecording, isSessionRecording, recordedActionCount, startSessionRecording, stopSessionRecording, unnamedWriteCount, } from '@/recorder/recorder'
import { MAX_SESSION_FILE_BYTES, parseSession, serializeSession, sessionFilename, } from '@/recorder/schema'
import { downloadBlob } from '@/utils/blob'
import { storeSession } from '@/utils/sessionsDB'
import styles from './SessionRecorderControls.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { SessionRecordingStartFailureReason, SessionStartExtras, } from '@/recorder/recorder'
import type { RecordedSession } from '@/recorder/schema'

function recordingStartFailureMessage(
  reason: SessionRecordingStartFailureReason,
): string {
  switch (reason) {
    case 'already-recording':
      return 'A step recording is already in progress'
    case 'workspace-not-serializable':
      return 'Recording could not start — this workspace cannot be serialized'
    case 'workspace-not-recordable':
      return 'Recording could not start — this workspace cannot be recorded safely'
  }
}

/**
 * Record/stop controls for the session recorder
 * (docs/plans/semantic-recorder-plan.md): starts a recording from the current
 * document, shows the live step count next to the unnamed-write count (the
 * log's honesty marker — unnamed writes will not replay), and downloads the
 * finished log as `.steps.json`. Also opens a saved log for replay, which the
 * host turns into a {@link SessionReplayPanel}.
 */
export function SessionRecorderControls(props: {
  flameDescriptor: FlameDescriptor
  /** Timeline, audio and editor side state to snapshot alongside the flame.
   *  Read at the moment recording starts, not at mount. */
  startExtras?: () => SessionStartExtras
  /** Runs only after the recorder accepts the captured workspace. */
  onRecordingStarted?: () => void
  onOpenSession: (session: RecordedSession) => void
  /** Called after a recording is stored, so the library list refetches. */
  onSessionStored: () => void
  onToggleLibrary: () => void
  libraryOpen?: boolean
  recordingsButtonRef?: (element: HTMLButtonElement) => void
  /** A legacy main-canvas export temporarily owns and restores the document. */
  blocked?: boolean
}) {
  const { showToast } = useToast()
  let fileInputRef: HTMLInputElement | undefined

  const startRecording = () => {
    if (props.blocked) {
      showToast(
        'Wait for the animation export to finish before recording',
        4000,
      )
      return
    }
    // No clone here: startSessionRecording owns that (and cloning a whole
    // flame document twice is not free on large flames). Timeline, audio and
    // sonification state go in alongside it: their commands edit state that
    // does not live in the flame descriptor.
    let extras: SessionStartExtras | undefined
    try {
      extras = props.startExtras?.()
    } catch (error) {
      console.warn('[recorder] could not capture the workspace state', error)
      showToast(
        'Recording could not start — the workspace state could not be captured',
        5000,
      )
      return
    }
    const result = startSessionRecording(props.flameDescriptor, extras)
    if (!result.ok) {
      showToast(recordingStartFailureMessage(result.reason), 5000)
      return
    }
    props.onRecordingStarted?.()
  }

  /**
   * Stopping keeps the recording in the browser rather than pushing a file at
   * the user; the library offers download when they actually want one.
   */
  const stopAndSave = () => {
    const session = stopSessionRecording()
    if (!session) return
    // A locale timestamp here produced filenames like
    // "Recording_8_7_2026_6_32_32_PM.steps.json" once the filename sanitiser
    // replaced its punctuation; a sortable stamp reads better in both places.
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
    const name =
      props.flameDescriptor.metadata?.name?.trim() || `Recording ${stamp}`
    void storeSession(session, name)
      .then(() => {
        props.onSessionStored()
        showToast(`Saved "${name}" — ${session.actions.length} steps`, 3500)
      })
      .catch((err: unknown) => {
        // Never lose the work to a storage failure: fall back to the file.
        console.warn('[recorder] could not store session', err)
        downloadBlob(
          new Blob([serializeSession(session)], { type: 'application/json' }),
          sessionFilename(name),
        )
        showToast('Could not save locally — downloaded the steps instead', 5000)
      })
  }

  const openSessionFile = async (file: File | undefined) => {
    if (!file) return
    // Check the browser-provided byte count before allocating and decoding an
    // attacker-controlled file. parseSession applies the decoded-char and
    // schema limits after this cheap boundary check.
    if (file.size > MAX_SESSION_FILE_BYTES) {
      showToast('That .steps.json file is too large to open safely', 4000)
      return
    }
    const session = parseSession(await file.text())
    if (!session) {
      showToast('That file is not a readable .steps.json session', 4000)
      return
    }
    props.onOpenSession(session)
  }

  return (
    <div class={styles.recorder}>
      <Show
        when={isSessionRecording()}
        fallback={
          <>
            <button
              type="button"
              class={`${styles.iconButton} ${styles.recordButton}`}
              onClick={startRecording}
              disabled={props.blocked}
              aria-label="Record steps"
              title="Record authored workspace changes as replayable steps"
            >
              <Record class={styles.icon} aria-hidden="true" />
            </button>
            <button
              ref={props.recordingsButtonRef}
              type="button"
              class={styles.iconButton}
              onClick={props.onToggleLibrary}
              aria-label="Recordings"
              aria-expanded={props.libraryOpen}
              aria-controls="session-recording-library"
              title={
                props.libraryOpen
                  ? 'Close saved recordings'
                  : 'Saved recordings — replay, download or delete'
              }
            >
              <Book class={styles.icon} aria-hidden="true" />
            </button>
            <button
              type="button"
              class={styles.iconButton}
              onClick={() => fileInputRef?.click()}
              aria-label="Open steps"
              title="Replay a saved .steps.json"
            >
              <FolderOpen class={styles.icon} aria-hidden="true" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              class={styles.fileInput}
              onChange={(ev) => {
                const input = ev.currentTarget
                void openSessionFile(input.files?.[0]).finally(() => {
                  // Clear it so re-picking the same file fires again.
                  input.value = ''
                })
              }}
            />
          </>
        }
      >
        <span
          class={styles.status}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span class={styles.live}>
            <span class={styles.dotRecording} aria-hidden="true" />{' '}
            {recordedActionCount()} replayable steps
          </span>
          <Show when={unnamedWriteCount() > 0}>
            <span
              class={styles.unnamed}
              title="Edits not yet routed through a registered command — replay will not reproduce them"
            >
              {unnamedWriteCount()} not captured
            </span>
          </Show>
        </span>
        <button type="button" class={styles.button} onClick={stopAndSave}>
          Stop &amp; save
        </button>
        <button
          type="button"
          class={styles.button}
          onClick={cancelSessionRecording}
        >
          Discard
        </button>
      </Show>
    </div>
  )
}
