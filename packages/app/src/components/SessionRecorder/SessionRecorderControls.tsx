import { Show } from 'solid-js'
import { useToast } from '@/contexts/ToastContext'
import { cancelSessionRecording, isSessionRecording, recordedActionCount, startSessionRecording, stopSessionRecording, unnamedWriteCount, } from '@/recorder/recorder'
import { parseSession, serializeSession, sessionFilename, } from '@/recorder/schema'
import { downloadBlob } from '@/utils/blob'
import styles from './SessionRecorderControls.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
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
  onOpenSession: (session: RecordedSession) => void
}) {
  const { showToast } = useToast()

  const startRecording = () => {
    // No clone here: startSessionRecording owns that (and cloning a whole
    // flame document twice is not free on large flames).
    startSessionRecording(props.flameDescriptor)
  }

  const stopAndSave = () => {
    const session = stopSessionRecording()
    if (!session) return
    downloadBlob(
      new Blob([serializeSession(session)], { type: 'application/json' }),
      sessionFilename(props.flameDescriptor.metadata?.name),
    )
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
