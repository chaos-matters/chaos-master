import { Show } from 'solid-js'
import { cancelSessionRecording, isSessionRecording, recordedActionCount, startSessionRecording, stopSessionRecording, unnamedWriteCount, } from '@/recorder/recorder'
import { serializeSession, sessionFilename } from '@/recorder/schema'
import { downloadBlob } from '@/utils/blob'
import { deepClone } from '@/utils/clone'
import styles from './SessionRecorderControls.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * Record/stop stub for the session recorder (M1 of
 * docs/plans/semantic-recorder-plan.md): starts a recording from the current
 * document, shows the live step count next to the unnamed-write count (the
 * log's honesty marker — unnamed writes will not replay), and downloads the
 * finished log as `.steps.json`. In-app replay and richer session management
 * arrive with M4/M5.
 */
export function SessionRecorderControls(props: {
  flameDescriptor: FlameDescriptor
}) {
  const startRecording = () => {
    startSessionRecording(deepClone(props.flameDescriptor))
  }

  const stopAndSave = () => {
    const session = stopSessionRecording()
    if (!session) return
    downloadBlob(
      new Blob([serializeSession(session)], { type: 'application/json' }),
      sessionFilename(props.flameDescriptor.metadata?.name),
    )
  }

  return (
    <div class={styles.recorder}>
      <Show
        when={isSessionRecording()}
        fallback={
          <button
            type="button"
            class={styles.button}
            onClick={startRecording}
            title="Record every action as a replayable step log"
          >
            <span class={styles.dot} /> Record steps
          </button>
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
