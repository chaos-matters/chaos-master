import { For, Show } from 'solid-js'
import { pilotLog } from '@/arcade/pilot'
import ui from './DuelNarration.module.css'
import type { PilotDriving } from '@/arcade/pilot'

/** How many lines of the agent's running commentary the strip keeps. */
const VISIBLE_LINES = 3

/**
 * What the AI says while it works, and how much budget it has left.
 *
 * Both used to render only inside the pilot's full-screen shield, which a duel
 * never draws — so the prompt card asked the agent to narrate, each call spent
 * a step, and nothing the agent said reached anybody.
 */
export function DuelNarration(props: { driving?: PilotDriving }) {
  const lines = () => pilotLog().slice(-VISIBLE_LINES)
  return (
    <Show when={props.driving}>
      {(driving) => (
        <div class={ui.rail}>
          <p class={ui.steps}>
            step {driving().steps} of {driving().stepBudget}
          </p>
          <div
            class={ui.lines}
            aria-live="polite"
            aria-label="What the AI says"
          >
            <For each={lines()}>
              {(entry) => (
                <p
                  class={ui.line}
                  classList={{
                    [ui.narrate!]: entry.kind === 'narrate',
                    [ui.error!]: entry.kind === 'error',
                  }}
                >
                  {entry.text}
                </p>
              )}
            </For>
          </div>
        </div>
      )}
    </Show>
  )
}
