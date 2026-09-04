import { createEffect, createSignal, For, onCleanup, Show, untrack, } from 'solid-js'
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
/**
 * The instrument line. It lives INSIDE the arc, not outside it: the mock's
 * strongest feature anywhere beyond the ring is a soft +20% swell, and a
 * hairline out there measured +345% over its neighbours — which is most of
 * what read as an unexplained rim.
 */
const BEZEL = RADIUS - 7
/** Tucked under the arc's widest stroke, so the plate's edge never shows. */
const PLATE = RADIUS - 5.5
const TICK_OUTER = RADIUS * 0.875
const TICK_MINOR = RADIUS * 0.044
const TICK_MAJOR = RADIUS * 0.157
const TICKS = 120
/**
 * Degrees of darkness where the two arcs meet. Both ends of both arcs pull
 * back by half of it, so the split reads as a cut rather than a colour change.
 */
const GAP_DEG = 3.5
/**
 * The hue runs along each arc rather than sitting flat on it: the anchored
 * end recedes and the score boundary blazes, which is the readability the
 * flat version lacked.
 */
const WARM_TAIL = '#8f3413'
const WARM_HEAD = '#fde7ac'
const COOL_TAIL = '#7633e3'
const COOL_HEAD = '#8bf0fb'
const SWEEP_DEG = 360 - 2 * GAP_DEG

function polar(deg: number, radius = RADIUS): [number, number] {
  // 0 degrees is twelve o'clock; positive is clockwise.
  const rad = ((deg - 90) * Math.PI) / 180
  return [CENTRE + radius * Math.cos(rad), CENTRE + radius * Math.sin(rad)]
}

/**
 * How many pieces each arc is drawn in.
 *
 * SVG cannot run a gradient along a curve, and a `linearGradient` across the
 * chord is visibly wrong once an arc passes a half turn. Segments are the
 * honest way: each takes a flat colour, and at this count the joins are
 * smaller than the stroke is wide.
 */
const SEGMENTS = 30

/** Hex to [r,g,b], for the only interpolation this file needs. */
function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(from: string, to: string, t: number): string {
  const a = rgb(from)
  const b = rgb(to)
  const c = a.map((v, i) => Math.round(v + (b[i]! - v) * t))
  return `rgb(${c[0]} ${c[1]} ${c[2]})`
}

/**
 * One arc as a run of segments, deepening from the fixed twelve o'clock
 * anchor to the meeting point that moves.
 *
 * The boundary is the only part of the ring that carries information — it is
 * where the lead is — so it is the part that blazes, and the anchored end
 * recedes into the plate.
 */
function segments(
  startDeg: number,
  sweepDeg: number,
): { d: string; t: number }[] {
  const step = sweepDeg / SEGMENTS
  return Array.from({ length: SEGMENTS }, (_, i) => ({
    // A hair of overlap, so a seam can never open between two segments.
    d: arc(startDeg + i * step, step * 1.04),
    t: (i + 0.5) / SEGMENTS,
  }))
}

function arc(startDeg: number, sweepDeg: number, radius = RADIUS): string {
  const [x1, y1] = polar(startDeg, radius)
  const [x2, y2] = polar(startDeg + sweepDeg, radius)
  const large = Math.abs(sweepDeg) > 180 ? 1 : 0
  const clockwise = sweepDeg > 0 ? 1 : 0
  return `M${x1} ${y1}A${radius} ${radius} 0 ${large} ${clockwise} ${x2} ${y2}`
}

/** The arc's inner edge, where the specular hairline rides. */
const INNER = RADIUS - 3.5

/**
 * How long the ring takes to catch up with the score.
 *
 * The share is recomputed on every edit, and a randomize can move it by a
 * third in one step; drawn straight it read as a twitch rather than as a
 * lead changing. Long enough to be a movement, short enough that the ring is
 * never lying about the score for more than half a beat.
 */
const SETTLE_MS = 520

/** How long the side that just gained stays lit. */
const PULSE_MS = 900

function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * The drawn share, chasing the scored one.
 *
 * Eased rather than sprung: a spring overshoots, and an overshooting score
 * ring shows a lead that did not happen.
 */
function useSettledShare(target: () => number) {
  const [shown, setShown] = createSignal(target())
  let frame: number | undefined
  const stop = () => {
    if (frame !== undefined) globalThis.cancelAnimationFrame(frame)
    frame = undefined
  }
  createEffect(() => {
    const goal = target()
    const from = untrack(shown)
    stop()
    if (prefersReducedMotion() || Math.abs(goal - from) < 0.0005) {
      setShown(goal)
      return
    }
    const started = globalThis.performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - started) / SETTLE_MS)
      // Ease-out cubic: fastest where the change is news, settling where it
      // is not.
      setShown(from + (goal - from) * (1 - (1 - k) ** 3))
      frame = k < 1 ? globalThis.requestAnimationFrame(step) : undefined
    }
    frame = globalThis.requestAnimationFrame(step)
  })
  onCleanup(stop)
  return shown
}

export function EclipseHud(props: {
  model: DuelHudModel
  onEnd: () => void
  /** Absent while the duel runs; the stage passes one once it is ending. */
  ending?: boolean
}) {
  // The player owns the left of the ring and the rival the right, matching
  // the halves they are playing.
  const playerShare = useSettledShare(() => props.model.playerShare)
  const rivalShare = () => 1 - playerShare()

  // Which side just gained, so the ring can say so rather than only show it.
  const [pulse, setPulse] = createSignal<'player' | 'rival'>()
  let last = untrack(() => props.model.playerShare)
  let pulseTimer: ReturnType<typeof globalThis.setTimeout> | undefined
  createEffect(() => {
    const next = props.model.playerShare
    const moved = next - last
    last = next
    if (Math.abs(moved) < 0.002 || prefersReducedMotion()) return
    setPulse(moved > 0 ? 'player' : 'rival')
    if (pulseTimer !== undefined) globalThis.clearTimeout(pulseTimer)
    pulseTimer = globalThis.setTimeout(() => {
      setPulse(undefined)
    }, PULSE_MS)
  })
  onCleanup(() => {
    if (pulseTimer !== undefined) globalThis.clearTimeout(pulseTimer)
  })

  const playerPath = () => arc(-GAP_DEG / 2, -SWEEP_DEG * playerShare())
  const rivalPath = () => arc(GAP_DEG / 2, SWEEP_DEG * rivalShare())
  const playerSegments = () =>
    segments(-GAP_DEG / 2, -SWEEP_DEG * playerShare())
  const rivalSegments = () => segments(GAP_DEG / 2, SWEEP_DEG * rivalShare())
  const playerInner = () => arc(-GAP_DEG / 2, -SWEEP_DEG * playerShare(), INNER)
  const rivalInner = () => arc(GAP_DEG / 2, SWEEP_DEG * rivalShare(), INNER)

  return (
    <div
      class={ui.hud}
      classList={{ [ui.urgent!]: props.model.urgent }}
      data-gained={pulse()}
    >
      <p class={ui.versus} aria-hidden="true">
        VS
      </p>
      <div class={ui.dial}>
        <div class={ui.vignette} aria-hidden="true" />
        <svg class={ui.ring} viewBox="0 0 464 464" aria-hidden="true">
          <defs>
            {/* The lift peaks inside the face and returns to the base tone
                at the rim. A gradient whose lightest stop sits on the edge of
                the circle it fills cannot help but draw a collar. */}
            <radialGradient id="duel-plate">
              <stop offset="0" stop-color="#05080c" />
              <stop offset="0.62" stop-color="#12141b" />
              <stop offset="1" stop-color="#06080d" />
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

          <circle cx={CENTRE} cy={CENTRE} r={PLATE} fill="url(#duel-plate)" />
          <circle class={ui.bezel} cx={CENTRE} cy={CENTRE} r={BEZEL} />

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
          {/* The core, segment by segment, so the hue travels along the arc:
              deep at the anchored end, blazing at the boundary that moves. */}
          <For each={playerSegments()}>
            {(seg) => (
              <path
                class={ui.warmCore}
                d={seg.d}
                stroke={mix(WARM_TAIL, WARM_HEAD, seg.t)}
              />
            )}
          </For>
          <For each={rivalSegments()}>
            {(seg) => (
              <path
                class={ui.coolCore}
                d={seg.d}
                stroke={mix(COOL_TAIL, COOL_HEAD, seg.t)}
              />
            )}
          </For>
          {/* The specular line: what gives the mock's bars their glass-tube
              solidity, a hairline riding the arc's inner edge. */}
          {/* `data-side` is the stable hook the component test measures each
              arc's sweep from; these two carry the full extent of their
              side, where the coloured core is drawn in segments. */}
          <path class={ui.specular} data-side="player" d={playerInner()} />
          <path class={ui.specular} data-side="rival" d={rivalInner()} />
        </svg>

        {/* No caption. A countdown in the middle of a dial is not ambiguous,
            and the label was pushing the numerals off the plate's centre. */}
        <div class={ui.readout}>
          <span class={ui.clock} aria-label="Time remaining">
            {props.model.clock}
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
        {(title) => <p class={ui.ready}>The agent is happy with "{title()}"</p>}
      </Show>
    </div>
  )
}
