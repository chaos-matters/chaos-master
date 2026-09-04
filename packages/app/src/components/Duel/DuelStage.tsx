import { createEffect, createMemo, createSignal, onCleanup, Show, } from 'solid-js'
import { duelReady, duelRemainingMs, duelRivalSeat, duelShowing, duelSidebarOpen, runningDuel, setDuelSidebarOpen, } from '@/arcade/duel'
import { finishDuel } from '@/arcade/duelActions'
import { duelHudModel } from '@/arcade/duelHud'
import { scoreSheetJudge } from '@/arcade/duelJudge'
import { duelResult } from '@/arcade/duelResult'
import { drivingState } from '@/arcade/pilot'
import { SidebarPanel } from '@/icons'
import { DuelChips } from './DuelChips'
import { DuelControls } from './DuelControls'
import { DuelNarration } from './DuelNarration'
import { DuelResultCard } from './DuelResultCard'
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
  /**
   * The viewer's own render settings, verbatim. A duel is two flames on one
   * GPU, so ultra converges at about half the rate it does on the workspace —
   * but it is the same target, deliberately: nothing here trims quality
   * because there are two canvases.
   */
  quality: number
  adaptiveFilter: boolean
  stochasticFilter: boolean
  /** The workspace sidebar's width in rem, so the stage can step aside. */
  sidebarWidthRem: Accessor<number>
}) {
  const [remaining, setRemaining] = createSignal(duelRemainingMs())
  const [ending, setEnding] = createSignal(false)
  let stageEl: HTMLDivElement | undefined

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

  // The chips cover the fast, high-leverage moves; the sidebar is for when
  // you know exactly which parameter you want. Rather than duplicate it, the
  // stage steps aside and lets the real one through — it is the same editor,
  // bound to the same store, with the same undo.
  // What the viewer had before the duel, restored when they close it again:
  // a duel is a few minutes long and should not rearrange the editor they
  // come back to.
  const sidebarBefore = props.ctx.sidebar.open()
  const toggleSidebar = () => {
    const next = !duelSidebarOpen()
    setDuelSidebarOpen(next)
    props.ctx.sidebar.setOpen(next ? true : sidebarBefore)
  }
  onCleanup(() => {
    if (duelSidebarOpen()) props.ctx.sidebar.setOpen(sidebarBefore)
  })

  // Written through a ref rather than the `style` prop: this is a CSS custom
  // property that another component's layout depends on, and an explicit
  // effect makes the dependency and the update order obvious.
  createEffect(() => {
    stageEl?.style.setProperty(
      '--duel-inset-left',
      duelSidebarOpen() ? `${props.sidebarWidthRem()}rem` : '0px',
    )
  })

  const end = () => {
    if (ending()) return
    setEnding(true)
    void finishDuel(props.ctx, 'stopped').finally(() => setEnding(false))
  }

  // The stage outlives the clock. `stopDuel` leaves the rival's seat alive
  // precisely so the result can be read over both flames, still rendering,
  // rather than over the black rectangle an unmounted canvas leaves behind.
  return (
    <Show when={duelShowing() && duelRivalSeat()}>
      {(rival) => (
        <div class={ui.stage} aria-label="Duel" ref={stageEl}>
          <div class={ui.seats}>
            <div class={ui.side}>
              <SeatView
                label="Your flame"
                score={model().playerScore}
                side="player"
                flame={props.playerFlame}
                zoom={props.playerZoom}
                position={props.playerPosition}
                quality={props.quality}
                adaptiveFilter={props.adaptiveFilter}
                stochasticFilter={props.stochasticFilter}
                interactive
              />
              <Show when={runningDuel()}>
                <DuelChips ctx={props.ctx} flame={props.playerFlame} />
                <DuelControls ctx={props.ctx} />
              </Show>
            </div>
            <div class={ui.side}>
              <SeatView
                label="The agent's flame"
                score={model().rivalScore}
                side="rival"
                flame={rival().flame}
                zoom={[rival().zoom, rival().setZoom]}
                position={[rival().position, rival().setPosition]}
                quality={props.quality}
                adaptiveFilter={props.adaptiveFilter}
                stochasticFilter={props.stochasticFilter}
                interactive={false}
              />
              {/* The agent's play-by-play, in its own half. On the seam it cut
                  the divider and stacked a fourth object into the centre
                  column; here it is the only thing this half has to hold. */}
              <Show when={runningDuel()}>
                <div class={ui.narrationSlot}>
                  <DuelNarration driving={drivingState()} />
                </div>
              </Show>
            </div>
          </div>
          <Show when={runningDuel()}>
            <button
              type="button"
              class={ui.sidebarToggle}
              aria-pressed={duelSidebarOpen()}
              onClick={toggleSidebar}
            >
              <SidebarPanel class={ui.sidebarIcon} aria-hidden="true" />
              {duelSidebarOpen() ? 'Hide the sidebar' : 'Show the sidebar'}
            </button>
          </Show>
          <Show when={duelResult()}>
            {(result) => (
              <DuelResultCard
                result={result()}
                quality={props.quality}
                adaptiveFilter={props.adaptiveFilter}
                stochasticFilter={props.stochasticFilter}
              />
            )}
          </Show>
          <Show when={runningDuel()}>
            <div class={ui.hudSlot}>
              <EclipseHud model={model()} onEnd={end} ending={ending()} />
            </div>
          </Show>
        </div>
      )}
    </Show>
  )
}
