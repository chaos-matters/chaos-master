import { createEffect, createMemo, createSignal, onCleanup, Show, } from 'solid-js'
import { duelReady, duelRemainingMs, runningDuel } from '@/arcade/duel'
import { finishDuel } from '@/arcade/duelActions'
import { duelHudModel } from '@/arcade/duelHud'
import { scoreSheetJudge } from '@/arcade/duelJudge'
import { drivingState } from '@/arcade/pilot'
import { DuelControls } from './DuelControls'
import { DuelNarration } from './DuelNarration'
import ui from './DuelStage.module.css'
import { EclipseHud } from './EclipseHud'
import { SeatView } from './SeatView'
import type { Accessor, Signal } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * The split screen.
 *
 * Mounted over the workspace, whose own canvas is parked while this is up, so
 * the player's flame renders once rather than twice. The clock here only
 * *displays* the time left; the ending is scheduled in `startDuel`, so a modal
 * covering the stage cannot leave the duel running forever.
 *
 * The HUD is deliberately one centred object rather than a full-width bar: the
 * two flames are the point, and a bar across the top crops both of them.
 */
export function DuelStage(props: {
  ctx: CommandContext
  playerFlame: Accessor<FlameDescriptor>
  playerZoom: Signal<number>
  playerPosition: Signal<v2f>
  quality: number
}) {
  const [remaining, setRemaining] = createSignal(duelRemainingMs())
  const [ending, setEnding] = createSignal(false)

  createEffect(() => {
    if (!runningDuel()) return
    const tick = window.setInterval(() => setRemaining(duelRemainingMs()), 250)
    onCleanup(() => {
      window.clearInterval(tick)
    })
  })

  // Memoised: the scores are read several times per render, and each read
  // walks both flames' transforms.
  const verdict = createMemo(() => {
    const state = runningDuel()
    if (!state) return undefined
    return scoreSheetJudge.judge(props.playerFlame(), state.rival.flame())
  })

  const model = createMemo(() =>
    duelHudModel({
      remainingMs: remaining(),
      durationMs: runningDuel()?.durationMs ?? 0,
      verdict: verdict(),
      readyTitle: duelReady()?.title,
    }),
  )

  const end = () => {
    if (ending()) return
    setEnding(true)
    void finishDuel(props.ctx, 'stopped').finally(() => setEnding(false))
  }

  return (
    <Show when={runningDuel()}>
      {(state) => (
        <div class={ui.stage} aria-label="Duel">
          <div class={ui.seats}>
            <div class={ui.side}>
              <SeatView
                label="Your flame"
                side="player"
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
                side="rival"
                flame={state().rival.flame}
                zoom={[state().rival.zoom, state().rival.setZoom]}
                position={[state().rival.position, state().rival.setPosition]}
                quality={props.quality}
                interactive={false}
              />
            </div>
          </div>
          <div class={ui.hudSlot}>
            <EclipseHud model={model()} onEnd={end} ending={ending()} />
            <DuelNarration driving={drivingState()} />
          </div>
        </div>
      )}
    </Show>
  )
}
