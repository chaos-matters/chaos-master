import { createEffect, For, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { NARRATION_COMMAND_ID } from '@/recorder/narrationMode'
import ui from './ReplayAgentRail.module.css'
import type { RecordedAction } from '@/recorder/schema'

/**
 * The pilot's rail, played back.
 *
 * While an agent drives, the lock overlay shows a running list of what it is
 * doing and why, and that list is the most convincing thing on screen — it is
 * the reasoning, not just the result. The same content is already in the
 * session file (every action carries a label, and narration carries the
 * sentence), so a replay can rebuild it without storing anything new.
 *
 * Shown only up to the current step: a rail that reveals the whole lesson at
 * step one spoils every beat the replay is pacing out.
 */
export function ReplayAgentRail(props: {
  actions: readonly RecordedAction[]
  stepIndex: number
}) {
  let railEl: HTMLElement | undefined

  const shown = () =>
    props.actions
      .slice(0, Math.max(0, props.stepIndex + 1))
      .map((action, index) => ({
        index,
        narration: action.id === NARRATION_COMMAND_ID,
        text: action.note ?? action.label ?? action.id,
      }))

  createEffect(() => {
    // Follow the run the way the live rail does.
    void props.stepIndex
    railEl?.scrollTo({ top: railEl.scrollHeight })
  })

  return (
    <Portal>
      <aside
        class={ui.rail}
        aria-label="Agent steps so far"
        aria-live="polite"
        ref={railEl}
      >
        <Show
          when={shown().length > 0}
          fallback={<p class={ui.empty}>Waiting for the first step.</p>}
        >
          <For each={shown()}>
            {(entry) => (
              <div
                classList={{
                  [ui.entry!]: true,
                  [ui.narrate!]: entry.narration,
                  [ui.current!]: entry.index === props.stepIndex,
                }}
              >
                {entry.text}
              </div>
            )}
          </For>
        </Show>
      </aside>
    </Portal>
  )
}
