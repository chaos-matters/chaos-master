import { createSignal, Show } from 'solid-js'
import { useToast } from '@/contexts/ToastContext'
import { Book, FolderOpen, Record, Speech } from '@/icons'
import { narrationAsStep, setNarrationAsStep } from '@/recorder/narrationMode'
import { cancelSessionRecording, isSessionRecording, recordedActionCount, startSessionRecording, stopSessionRecording, unnamedWriteCount, } from '@/recorder/recorder'
import { MAX_SESSION_FILE_BYTES, parseSession, serializeSession, sessionFilename, } from '@/recorder/schema'
import { downloadBlob } from '@/utils/blob'
import { storeImportedSession, storeSession } from '@/utils/sessionsDB'
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
  onSessionStored: (options?: { openLibrary?: boolean }) => void
  onToggleLibrary: () => void
  libraryOpen?: boolean
  recordingsButtonRef?: (element: HTMLButtonElement) => void
  /** A legacy main-canvas export temporarily owns and restores the document. */
  blocked?: boolean
}) {
  const { showToast } = useToast()
  const [importingSession, setImportingSession] = createSignal(false)
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
    if (!file || importingSession()) return
    // Check the browser-provided byte count before allocating and decoding an
    // attacker-controlled file. parseSession applies the decoded-char and
    // schema limits after this cheap boundary check.
    if (file.size > MAX_SESSION_FILE_BYTES) {
      showToast('That .steps.json file is too large to open safely', 4000)
      return
    }
    setImportingSession(true)
    try {
      const session = parseSession(await file.text())
      if (!session) {
        showToast('That file is not a readable .steps.json session', 4000)
        return
      }

      try {
        const result = await storeImportedSession(session, file.name)
        if (result.added) {
          props.onSessionStored({ openLibrary: false })
          showToast(`Imported "${result.name}" to Recordings`, 3500)
        } else {
          showToast(`"${result.name}" is already in Recordings`, 3500)
        }
      } catch (error: unknown) {
        // Opening the validated take is still useful when IndexedDB is
        // unavailable (private browsing, quota, or transient browser error).
        console.warn('[recorder] could not store imported session', error)
        showToast(
          'Replay opened, but it could not be saved to Recordings',
          5000,
        )
      }
      props.onOpenSession(session)
    } catch (error: unknown) {
      console.warn('[recorder] could not read imported session', error)
      showToast('That .steps.json file could not be read', 4000)
    } finally {
      setImportingSession(false)
    }
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
              classList={{
                [styles.toggleOn as string]: !narrationAsStep(),
              }}
              onClick={() => setNarrationAsStep((on) => !on)}
              aria-pressed={!narrationAsStep()}
              aria-label={
                narrationAsStep()
                  ? 'Fold narration into the step it introduces'
                  : 'Record narration as its own step'
              }
              // Both titles name where the change shows up. The setting is read
              // as each narration lands, so pressing it with nothing recording
              // changes nothing on screen — which read as a dead button.
              title={
                narrationAsStep()
                  ? 'How narration is recorded: as its own step, a caption that holds while nothing moves. Shows up in the next recording you or the AI make.'
                  : 'How narration is recorded: as the caption on the next step, so the list is only what changed. Shows up in the next recording you or the AI make.'
              }
            >
              <Speech class={styles.icon} aria-hidden="true" />
            </button>
            <button
              type="button"
              class={styles.iconButton}
              onClick={() => fileInputRef?.click()}
              disabled={importingSession()}
              aria-busy={importingSession()}
              aria-label="Open steps"
              title={
                importingSession()
                  ? 'Importing steps…'
                  : 'Import a .steps.json into Recordings and replay it'
              }
            >
              <FolderOpen class={styles.icon} aria-hidden="true" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              class={styles.fileInput}
              disabled={importingSession()}
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
