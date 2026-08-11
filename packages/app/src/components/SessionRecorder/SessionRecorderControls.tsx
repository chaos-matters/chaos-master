import { Show } from 'solid-js'
import { useToast } from '@/contexts/ToastContext'
import { cancelSessionRecording, isSessionRecording, recordedActionCount, startSessionRecording, stopSessionRecording, unnamedWriteCount, } from '@/recorder/recorder'
import { parseSession, serializeSession, sessionFilename, } from '@/recorder/schema'
import { downloadBlob } from '@/utils/blob'
import { storeSession } from '@/utils/sessionsDB'
import styles from './SessionRecorderControls.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { SessionStartExtras } from '@/recorder/recorder'
import type { RecordedSession } from '@/recorder/schema'

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
  /** The timeline and audio wiring to snapshot alongside the flame. Read at
   *  the moment recording starts, not at mount. */
  startExtras?: () => SessionStartExtras
  onOpenSession: (session: RecordedSession) => void
  /** Called after a recording is stored, so the library list refetches. */
  onSessionStored: () => void
  onToggleLibrary: () => void
}) {
  const { showToast } = useToast()

  const startRecording = () => {
    // No clone here: startSessionRecording owns that (and cloning a whole
    // flame document twice is not free on large flames). The timeline and
    // audio wiring go in alongside the flame: keyframe edits mean nothing
    // without the tracks they land on.
    startSessionRecording(props.flameDescriptor, props.startExtras?.())
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
              class={styles.button}
              onClick={startRecording}
              title="Record every action as a replayable step log"
            >
              <span class={styles.dot} /> Record steps
            </button>
            <button
              type="button"
              class={styles.button}
              onClick={props.onToggleLibrary}
              title="Saved recordings — replay, download or delete"
            >
              ⛁ Recordings
            </button>
            <label class={styles.button} title="Replay a saved .steps.json">
              Open steps
              <input
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
            </label>
          </>
        }
      >
        <span class={styles.live}>
          <span class={styles.dotRecording} /> {recordedActionCount()} steps
        </span>
        <Show when={unnamedWriteCount() > 0}>
          <span
            class={styles.unnamed}
            title="Edits not yet routed through a registered command — replay will not reproduce them"
          >
            {unnamedWriteCount()} unnamed
          </span>
        </Show>
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
