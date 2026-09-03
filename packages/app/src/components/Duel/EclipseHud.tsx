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
 * Everything is drawn in viewBox units against a fixed 464-unit square, so
 * one CSS property (`--duel-dial-size`) scales the ring, the glow, the ticks
 * and the type together and the proportions can never drift apart. A second
 * look — the arcade bar — is meant to be another component over the same
 * `DuelHudModel`, not another set of sums.
 */
const CENTRE = 232
/** Score-ring centreline. Stroke, bezel and ticks are all ratios of this. */
const RADIUS = 203.5
const BEZEL = RADIUS * 1.094
const TICK_OUTER = RADIUS * 0.875
const TICK_MINOR = RADIUS * 0.044
const TICK_MAJOR = RADIUS * 0.157
const TICKS = 120
/**
 * Degrees of darkness where the two arcs meet. Both ends of both arcs pull
 * back by half of it, so the split reads as a cut rather than a colour change.
 */
const GAP_DEG = 3.5
const SWEEP_DEG = 360 - 2 * GAP_DEG

function polar(deg: number): [number, number] {
  // 0 degrees is twelve o'clock; positive is clockwise.
  const rad = ((deg - 90) * Math.PI) / 180
  return [CENTRE + RADIUS * Math.cos(rad), CENTRE + RADIUS * Math.sin(rad)]
}

function arc(startDeg: number, sweepDeg: number): string {
  const [x1, y1] = polar(startDeg)
  const [x2, y2] = polar(startDeg + sweepDeg)
  const large = Math.abs(sweepDeg) > 180 ? 1 : 0
  const clockwise = sweepDeg > 0 ? 1 : 0
  return `M${x1} ${y1}A${RADIUS} ${RADIUS} 0 ${large} ${clockwise} ${x2} ${y2}`
}

export function EclipseHud(props: {
  model: DuelHudModel
  onEnd: () => void
  /** Absent while the duel runs; the stage passes one once it is ending. */
  ending?: boolean
}) {
  // The player owns the left of the ring and the rival the right, matching
  // the halves they are playing.
  const playerPath = () =>
    arc(-GAP_DEG / 2, -SWEEP_DEG * props.model.playerShare)
  const rivalPath = () => arc(GAP_DEG / 2, SWEEP_DEG * props.model.rivalShare)

  return (
    <div class={ui.hud} classList={{ [ui.urgent!]: props.model.urgent }}>
      <p class={ui.versus} aria-hidden="true">
        VS
      </p>
      <div class={ui.dial}>
        <div class={ui.vignette} aria-hidden="true" />
        <svg class={ui.ring} viewBox="0 0 464 464" aria-hidden="true">
          <defs>
            <radialGradient id="duel-plate">
              <stop offset="0" stop-color="#05080c" />
              <stop offset="0.64" stop-color="#05080c" />
              <stop offset="1" stop-color="#141218" />
            </radialGradient>
            {/* Blur in viewBox units, so the bloom scales with the dial
                rather than being a fixed pixel halo at every size. */}
            <filter
              id="duel-bloom-near"
              x="-40%"
              y="-40%"
              width="180%"
              height="180%"
            >
              <feGaussianBlur stdDeviation="5" />
            </filter>
            <filter
              id="duel-bloom-far"
              x="-60%"
              y="-60%"
              width="220%"
              height="220%"
            >
              <feGaussianBlur stdDeviation="15" />
            </filter>
          </defs>

          <circle
            cx={CENTRE}
            cy={CENTRE}
            r={BEZEL - 6}
            fill="url(#duel-plate)"
          />

          <g class={ui.ticks}>
            <For each={Array.from({ length: TICKS }, (_, i) => i)}>
              {(i) => {
                const major = i % 15 === 0
                return (
                  <line
                    class={major ? ui.tickMajor : ui.tickMinor}
                    x1={CENTRE}
                    y1={CENTRE - TICK_OUTER}
                    x2={CENTRE}
                    y2={CENTRE - TICK_OUTER + (major ? TICK_MAJOR : TICK_MINOR)}
                    transform={`rotate(${(i * 360) / TICKS} ${CENTRE} ${CENTRE})`}
                  />
                )
              }}
            </For>
          </g>

          {/* Each arc three times: a wide soft hue, a tight bright one, and
              the near-white core on top. All of the colour is in the bloom —
              a flat saturated stroke reads as plastic. */}
          <g filter="url(#duel-bloom-far)">
            <path class={ui.warmFar} d={playerPath()} />
            <path class={ui.coolFar} d={rivalPath()} />
          </g>
          <g filter="url(#duel-bloom-near)">
            <path class={ui.warmNear} d={playerPath()} />
            <path class={ui.coolNear} d={rivalPath()} />
          </g>
          <path class={ui.warmCore} d={playerPath()} />
          <path class={ui.coolCore} d={rivalPath()} />

          <circle class={ui.bezel} cx={CENTRE} cy={CENTRE} r={BEZEL} />
        </svg>

        <div class={ui.readout}>
          <span class={ui.clock} aria-label="Time remaining">
            {props.model.clock}
          </span>
          <span class={ui.clockLabel}>Time remaining</span>
        </div>

        <span class={`${ui.score} ${ui.playerScore}`}>
          {props.model.playerScore}
        </span>
        <span class={`${ui.score} ${ui.rivalScore}`}>
          {props.model.rivalScore}
        </span>
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
