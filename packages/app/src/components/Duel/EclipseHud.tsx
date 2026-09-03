import { For, Show } from 'solid-js'
import ui from './EclipseHud.module.css'
import type { DuelHudModel } from '@/arcade/duelHud'

/**
 * The duel HUD as a single dial straddling the divider.
 *
 * The ring is the score: one closed loop split into a warm arc and a cool one
 * whose meeting points slide as the lead changes, so being ahead is literally
 * owning more of the ring. That works where a pair of filled bars does not —
 * `powerLevel` has no maximum, so there is nothing to fill a bar against, but
 * a share of a fixed loop is meaningful at any scale.
 *
 * It is a pure component over `DuelHudModel`: a second look (the arcade bar)
 * is meant to be another component over the same model, not another set of
 * sums.
 */
const RADIUS = 46
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const TICKS = 60
/** Leaves a small gap where the two arcs meet, so the split stays legible. */
const ARC_GAP = 0.012

export function EclipseHud(props: {
  model: DuelHudModel
  onEnd: () => void
  /** Absent while the duel runs; the stage passes one once it is ending. */
  ending?: boolean
}) {
  const playerArc = () =>
    Math.max(0, props.model.playerShare - ARC_GAP) * CIRCUMFERENCE
  const rivalArc = () =>
    Math.max(0, props.model.rivalShare - ARC_GAP) * CIRCUMFERENCE
  // The player's arc starts at twelve o'clock and runs clockwise; the rival's
  // picks up where it ends, so the two always close one loop.
  const rivalOffset = () => -props.model.playerShare * CIRCUMFERENCE

  return (
    <div class={ui.hud} classList={{ [ui.urgent!]: props.model.urgent }}>
      <p class={ui.versus} aria-hidden="true">
        VS
      </p>
      <div class={ui.dial}>
        <svg class={ui.ring} viewBox="0 0 120 120" aria-hidden="true">
          <circle class={ui.track} cx="60" cy="60" r={RADIUS} />
          <g class={ui.ticks}>
            <For each={Array.from({ length: TICKS }, (_, i) => i)}>
              {(i) => (
                <line
                  x1="60"
                  y1="6"
                  x2="60"
                  y2={i % 5 === 0 ? 12 : 9.5}
                  transform={`rotate(${(i * 360) / TICKS} 60 60)`}
                />
              )}
            </For>
          </g>
          <circle
            class={ui.playerArc}
            cx="60"
            cy="60"
            r={RADIUS}
            stroke-dasharray={`${playerArc()} ${CIRCUMFERENCE}`}
          />
          <circle
            class={ui.rivalArc}
            cx="60"
            cy="60"
            r={RADIUS}
            stroke-dasharray={`${rivalArc()} ${CIRCUMFERENCE}`}
            stroke-dashoffset={rivalOffset()}
          />
        </svg>
        <div class={ui.readout}>
          <span class={ui.clock} aria-label="Time remaining">
            {props.model.clock}
          </span>
          <span class={ui.scores}>
            <span class={ui.playerScore}>{props.model.playerScore}</span>
            <span class={ui.scoreDash} aria-hidden="true">
              /
            </span>
            <span class={ui.rivalScore}>{props.model.rivalScore}</span>
          </span>
        </div>
      </div>
      <button
        type="button"
        class={ui.end}
        onClick={() => {
          props.onEnd()
        }}
        disabled={props.ending === true}
      >
        {props.ending === true ? 'Ending…' : 'End the duel'}
      </button>
      <Show when={props.model.readyTitle}>
        {(title) => <p class={ui.ready}>The AI is happy with "{title()}"</p>}
      </Show>
    </div>
  )
}
