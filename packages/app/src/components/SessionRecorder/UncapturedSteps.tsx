/**
 * A take's uncaptured steps, by name.
 *
 * "1 not captured" says a replay will differ without saying where or why, so
 * the count is a disclosure: it opens into what each step was and when it
 * happened. One component for every place that shows the count (the recorder
 * controls while a take runs, each entry in the library, the replay panel), so
 * none of them is left with a bare number. A take recorded before names were
 * saved says that instead of a list.
 */
import { For, Show } from 'solid-js'
import { ChevronDown } from '@/icons'
import { describeExportSkips, summarizeUncapturedSteps, } from '@/recorder/uncapturedSteps'
import styles from './UncapturedSteps.module.css'
import type { RecordedAction } from '@/recorder/schema'
import type { UncapturedSource } from '@/recorder/uncapturedSteps'

export function UncapturedSteps(props: {
  session: UncapturedSource
  /** Open over the surrounding content instead of pushing it down: the
   *  recorder pill has no room to grow. */
  floating?: boolean
}) {
  const summary = () => summarizeUncapturedSteps(props.session)
  return (
    <Show when={summary().count > 0}>
      <details
        class={styles.uncaptured}
        classList={{ [styles.floating as string]: props.floating === true }}
        data-uncaptured-steps
      >
        <summary
          class={styles.summary}
          title="Steps a replay cannot reproduce. Open to see which."
        >
          {summary().count} not captured
          <ChevronDown class={styles.chevron} aria-hidden="true" />
        </summary>
        <div class={styles.body}>
          <StepLines lines={summary().lines} note={summary().note} />
        </div>
      </details>
    </Show>
  )
}

/**
 * What an export of this take will skip, said before the export starts: the
 * video applies the recorded steps and nothing else, so it can differ from the
 * take from the first uncaptured step on. The owner shows this in place of
 * starting, and starts on the next press of its export button.
 */
export function ExportSkipNotice(props: {
  session: UncapturedSource & { actions: readonly RecordedAction[] }
  id: string
  onCancel: () => void
}) {
  const summary = () => summarizeUncapturedSteps(props.session)
  return (
    <div
      id={props.id}
      class={styles.skipNotice}
      role="status"
      data-replay-export-skips
    >
      <p class={styles.skipText}>{describeExportSkips(props.session)}</p>
      <div class={styles.skipList}>
        <StepLines lines={summary().lines} note={summary().note} />
      </div>
      <button
        type="button"
        class={styles.cancel}
        aria-label="Cancel export"
        onClick={() => {
          props.onCancel()
        }}
      >
        Cancel
      </button>
    </div>
  )
}

function StepLines(props: { lines: readonly string[]; note?: string }) {
  return (
    <>
      <Show when={props.lines.length > 0}>
        <ol class={styles.list}>
          <For each={props.lines}>{(line) => <li>{line}</li>}</For>
        </ol>
      </Show>
      <Show when={props.note}>
        {(note) => <p class={styles.note}>{note()}</p>}
      </Show>
    </>
  )
}
