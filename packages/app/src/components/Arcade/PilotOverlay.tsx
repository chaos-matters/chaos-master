import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { agentDriving, drivingState, lastPilotSession, pilot, pilotElapsedMs, pilotLog, resetPilot, } from '@/arcade/pilot'
import { finishPilot } from '@/arcade/pilotActions'
import { Robot, Stop } from '@/icons'
import { formatElapsed, reasonLabel } from './pilotFormat'
import ui from './PilotOverlay.module.css'
import type { PilotEnded } from '@/arcade/pilot'
import type { CommandContext } from '@/commands/types'

const ESC_ARM_MS = 1500

/**
 * Hard lock while an agent drives: a full-screen shield swallows pointer
 * input, the banner says what is happening, and Stop (or Esc twice) ends the
 * take and still saves it. When the pilot ends, the same component shows the
 * end card with Replay / Back to Arcade.
 */
export function PilotOverlay(props: { ctx: CommandContext }) {
  const [escArmed, setEscArmed] = createSignal(false)
  const [elapsed, setElapsed] = createSignal(0)
  let escTimer: number | undefined
  let railEl: HTMLElement | undefined

  const stop = () => {
    void finishPilot(props.ctx, 'stopped')
  }

  createEffect(() => {
    if (!agentDriving()) return
    const tick = window.setInterval(() => setElapsed(pilotElapsedMs()), 1000)
    // Captured on the way down so nothing else can claim Escape first: while
    // the AI drives, Escape means "give me the controls back", never "close
    // this panel".
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      ev.preventDefault()
      ev.stopImmediatePropagation()
      if (escArmed()) {
        setEscArmed(false)
        stop()
        return
      }
      setEscArmed(true)
      window.clearTimeout(escTimer)
      escTimer = window.setTimeout(() => setEscArmed(false), ESC_ARM_MS)
    }
    document.addEventListener('keydown', onKey, true)
    onCleanup(() => {
      window.clearInterval(tick)
      window.clearTimeout(escTimer)
      document.removeEventListener('keydown', onKey, true)
      setElapsed(0)
    })
  })

  createEffect(() => {
    pilotLog()
    railEl?.scrollTo({ top: railEl.scrollHeight })
  })

  const ended = () =>
    pilot().phase === 'ended' ? (pilot() as PilotEnded) : undefined

  return (
    <>
      <Show when={drivingState()}>
        {(state) => (
          <div
            class={ui.shield}
            role="dialog"
            aria-modal="true"
            aria-label="AI is driving the editor"
          >
            <div class={ui.banner}>
              <Robot class={ui.icon} aria-hidden="true" />
              <div class={ui.titleBlock}>
                <div class={ui.title}>{state().title}</div>
                <div class={ui.meta}>
                  step {state().steps} of {state().stepBudget} ·{' '}
                  {formatElapsed(elapsed())} · recording
                </div>
              </div>
              <button
                type="button"
                class={ui.stop}
                onClick={stop}
                aria-label="Stop the AI and keep what was recorded"
              >
                <Stop aria-hidden="true" />
                {escArmed() ? 'Press Esc again to stop' : 'Stop'}
              </button>
            </div>
            <aside
              class={ui.rail}
              aria-label="Steps so far"
              aria-live="polite"
              ref={railEl}
            >
              <For each={pilotLog()}>
                {(entry) => (
                  <div
                    classList={{
                      [ui.entry!]: true,
                      [ui.narrate!]: entry.kind === 'narrate',
                      [ui.error!]: entry.kind === 'error',
                      [ui.system!]: entry.kind === 'system',
                    }}
                  >
                    {entry.text}
                  </div>
                )}
              </For>
            </aside>
            <div class={ui.hint}>
              You are watching. Press Esc twice or Stop to take over.
            </div>
          </div>
        )}
      </Show>
      <Show when={ended()}>
        {(end) => (
          <div
            class={ui.endBackdrop}
            role="dialog"
            aria-modal="true"
            aria-label={`${end().title}: ${reasonLabel(end().reason)}`}
          >
            <div class={ui.endCard}>
              <h2 class={ui.endTitle}>{end().title}</h2>
              <p class={ui.endMeta}>
                {end().steps} steps · {formatElapsed(end().durationMs)} ·{' '}
                {reasonLabel(end().reason)}
              </p>
              <Show when={end().summary}>
                {(summary) => <p class={ui.endSummary}>{summary()}</p>}
              </Show>
              <Show when={end().sessionName}>
                {(name) => (
                  <p class={ui.endSaved}>Saved to your library as "{name()}"</p>
                )}
              </Show>
              <div class={ui.endActions}>
                <Show when={lastPilotSession()}>
                  {(session) => (
                    <button
                      type="button"
                      class={ui.primary}
                      onClick={() => {
                        const take = session()
                        resetPilot()
                        props.ctx.recorder?.openReplay(take)
                      }}
                    >
                      Replay
                    </button>
                  )}
                </Show>
                <button
                  type="button"
                  onClick={() => {
                    resetPilot()
                    props.ctx.arcade?.openHub()
                  }}
                >
                  Back to Arcade
                </button>
                <button type="button" onClick={resetPilot}>
                  Stay in the editor
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </>
  )
}
