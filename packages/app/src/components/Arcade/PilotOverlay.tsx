import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { duelActive } from '@/arcade/duel'
import { finishDuel } from '@/arcade/duelActions'
import { agentDriving, drivingState, lastPilotSession, pilot, pilotElapsedMs, pilotLog, resetPilot, } from '@/arcade/pilot'
import { finishPilot } from '@/arcade/pilotActions'
import { Robot, Stop } from '@/icons'
import { formatElapsed, reasonLabel, savedLine } from './pilotFormat'
import ui from './PilotOverlay.module.css'
import { PilotSpotlight } from './PilotSpotlight'
import type { PilotEnded } from '@/arcade/pilot'
import type { CommandContext } from '@/commands/types'
import type { ReplayFocusPreparationHandler } from '@/recorder/focusPreparation'

const ESC_ARM_MS = 1500

/**
 * Hard lock while an agent drives: a full-screen shield swallows pointer
 * input, the banner says what is happening, and Stop (or Esc twice) ends the
 * take and still saves it. When the pilot ends, the same component shows the
 * end card with Replay / Back to Arcade.
 */
export function PilotOverlay(props: {
  ctx: CommandContext
  onPrepareFocus?: ReplayFocusPreparationHandler
}) {
  const [escArmed, setEscArmed] = createSignal(false)
  const [elapsed, setElapsed] = createSignal(0)
  let escTimer: number | undefined
  let railEl: HTMLElement | undefined

  // A duel needs its own ending: `finishPilot` would end the pilot and leave
  // the stage up with the rival seat still alive.
  const stop = () => {
    if (duelActive()) {
      void finishDuel(props.ctx, 'stopped')
      return
    }
    void finishPilot(props.ctx, 'stopped')
  }

  createEffect(() => {
    if (!agentDriving()) return
    const tick = window.setInterval(() => setElapsed(pilotElapsedMs()), 1000)
    onCleanup(() => {
      window.clearInterval(tick)
      setElapsed(0)
    })
  })

  createEffect(() => {
    // Only the screen lock claims Escape. Under a seat lock the shield is not
    // drawn, so swallowing every Escape globally took the key away from every
    // dialog in the app with nothing on screen to explain why — and two of
    // them within 1500 ms silently ended the take.
    if (drivingState()?.lock !== 'screen') return
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
      window.clearTimeout(escTimer)
      document.removeEventListener('keydown', onKey, true)
      setEscArmed(false)
    })
  })

  createEffect(() => {
    pilotLog()
    railEl?.scrollTo({ top: railEl.scrollHeight })
  })

  const ended = () =>
    pilot().phase === 'ended' ? (pilot() as PilotEnded) : undefined

  // Escape on the end card does what "Stay in the editor" does. A modal that
  // ignores Escape is a modal people feel stuck in, and by this point the
  // take is already saved, so dismissing it costs nothing.
  createEffect(() => {
    if (!ended()) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      ev.preventDefault()
      ev.stopImmediatePropagation()
      resetPilot()
    }
    document.addEventListener('keydown', onKey, true)
    onCleanup(() => {
      document.removeEventListener('keydown', onKey, true)
    })
  })

  return (
    <>
      <Show when={drivingState()}>
        {(state) => (
          // A seat-scoped lock covers only the agent's half of a duel, and the
          // duel stage draws that half itself — a full-screen shield here
          // would also lock the viewer out of the seat they are playing.
          <Show when={state().lock === 'screen'}>
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
          </Show>
        )}
      </Show>
      <Show when={agentDriving()}>
        <PilotSpotlight onPrepareFocus={props.onPrepareFocus} />
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
                  <p
                    classList={{
                      [ui.endSaved!]: true,
                      [ui.endFailed!]: end().saved === false,
                    }}
                  >
                    {savedLine(name(), end().saved)}
                  </p>
                )}
              </Show>
              <div class={ui.endActions}>
                <Show
                  when={
                    end().mode === 'cinema' &&
                    props.ctx.timeline.tracks().length > 0
                  }
                >
                  {/* The take is an animation nobody has watched at speed
                      yet: playback during the session runs once per call and
                      stops, and the card covers the canvas. This closes the
                      card and plays it from the first frame. */}
                  <button
                    type="button"
                    class={ui.primary}
                    onClick={() => {
                      resetPilot()
                      props.ctx.timeline.setLoop(false)
                      props.ctx.timeline.setCurrentFrame(0)
                      props.ctx.timeline.play()
                    }}
                  >
                    Play the animation
                  </button>
                </Show>
                <Show when={lastPilotSession()}>
                  {(session) => (
                    <button
                      type="button"
                      // Offered even when the library write failed: the take
                      // is still in memory, so it is still replayable. The
                      // card says separately that it did not reach the library.
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
