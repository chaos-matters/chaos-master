import { createEffect, createSignal, onCleanup, Show } from 'solid-js'
import { duelRemainingMs, runningDuel } from '@/arcade/duel'
import { scoreSheetJudge } from '@/arcade/duelJudge'
import { finishPilot } from '@/arcade/pilotActions'
import { formatElapsed } from '@/components/Arcade/pilotFormat'
import { DuelControls } from './DuelControls'
import ui from './DuelStage.module.css'
import { SeatView } from './SeatView'
import type { Accessor, Signal } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * The split screen.
 *
 * Mounted over the workspace, whose own canvas is parked while this is up, so
 * the player's flame renders once rather than twice. The clock is shared: when
 * it reaches zero the duel ends exactly as Stop does, through `finishPilot`,
 * so a timed-out take is saved like any other.
 */
export function DuelStage(props: {
  ctx: CommandContext
  playerFlame: Accessor<FlameDescriptor>
  playerZoom: Signal<number>
  playerPosition: Signal<v2f>
  quality: number
}) {
  const [remaining, setRemaining] = createSignal(duelRemainingMs())

  createEffect(() => {
    if (!runningDuel()) return
    const tick = window.setInterval(() => {
      const left = duelRemainingMs()
      setRemaining(left)
      if (left <= 0) {
        window.clearInterval(tick)
        void finishPilot(props.ctx, 'finished')
      }
    }, 250)
    onCleanup(() => {
      window.clearInterval(tick)
    })
  })

  const verdict = () => {
    const state = runningDuel()
    if (!state) return undefined
    return scoreSheetJudge.judge(props.playerFlame(), state.rival.flame())
  }

  return (
    <Show when={runningDuel()}>
      {(state) => (
        <div class={ui.stage} aria-label="Duel">
          <header class={ui.clockBar}>
            <span class={ui.clock} aria-label="Time remaining">
              {formatElapsed(remaining())}
            </span>
            <span class={ui.score}>
              {verdict()?.playerScore ?? 0} - {verdict()?.rivalScore ?? 0}
            </span>
            <button
              type="button"
              class={ui.stop}
              onClick={() => void finishPilot(props.ctx, 'stopped')}
            >
              End the duel
            </button>
          </header>
          <div class={ui.seats}>
            <div class={ui.side}>
              <SeatView
                label="Your flame"
                flame={props.playerFlame}
                zoom={props.playerZoom}
                position={props.playerPosition}
                quality={props.quality}
                interactive
              />
              <DuelControls ctx={props.ctx} />
            </div>
            <div class={ui.side}>
              <SeatView
                label="The AI's flame"
                flame={state().rival.flame}
                zoom={[state().rival.zoom, state().rival.setZoom]}
                position={[state().rival.position, state().rival.setPosition]}
                quality={props.quality}
                interactive={false}
              />
            </div>
          </div>
        </div>
      )}
    </Show>
  )
}
