/**
 * The Flame Clash stage: one scripted bout between two fighters, on a canvas
 * of its own.
 *
 * It owns everything it draws: its canvas, its fight flame (rebuilt from the
 * bout's frame on every tick) and its clock. It never reads or writes the
 * editor's document, timeline or commands, so opening it cannot change what
 * the user was working on.
 *
 * The clock starts when the first frame of the fight has rendered, so a
 * shader compile never eats the intro, and it pauses in a background tab.
 */
import { createEffect, createMemo, createSignal, on, onCleanup } from 'solid-js'
import { vec4f } from 'typegpu/data'
import { beatCaption, BOUT_SECONDS, boutFrame, orbitCamera, } from '@/flame/clash/choreographer'
import { fightFlame } from '@/flame/clash/fightFlame'
import { TEAM_COLOUR } from '@/flame/clash/tint'
import { Flam3 } from '@/flame/Flam3'
import { Reset } from '@/icons'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Default3DPreviewCamera } from '@/lib/Camera3D'
import { useCanvas } from '@/lib/CanvasContext'
import { CLOCK_AT_START, tickClock } from './clashClock'
import ui from './ClashStage.module.css'
import type { ClashCamera } from '@/flame/clash/choreographer'
import type { ClashFighter } from '@/flame/clash/fightFlame'
import type { Team } from '@/flame/clash/tint'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export type ClashStageProps = {
  a: ClashFighter
  b: ClashFighter
  winner: Team
  reducedMotion: boolean
  /** Canvas pixels per CSS pixel: below 1 on weaker hardware. */
  renderScale: number
  pointCountPerBatch: number
  onReducedMotionChange: (reduced: boolean) => void
  onChangeFighters?: () => void
}

const NO_EDGE_FADE = vec4f(0)

export function ClashStage(props: ClashStageProps) {
  const [wall, setWall] = createSignal(0)
  let clock = CLOCK_AT_START
  let raf = 0
  let running = false

  const tick = (now: number) => {
    clock = tickClock(clock, now, BOUT_SECONDS)
    setWall(clock.elapsed)
    raf = clock.elapsed < BOUT_SECONDS ? requestAnimationFrame(tick) : 0
  }
  const play = () => {
    cancelAnimationFrame(raf)
    clock = CLOCK_AT_START
    setWall(0)
    raf = requestAnimationFrame(tick)
  }
  const onFirstFrame = () => {
    if (running) return
    running = true
    play()
  }
  onCleanup(() => {
    cancelAnimationFrame(raf)
  })
  // A change of script starts the bout again rather than jumping mid-beat.
  createEffect(
    on(
      () => props.reducedMotion,
      () => {
        if (running) play()
      },
      { defer: true },
    ),
  )

  const frame = createMemo(() =>
    boutFrame(wall(), {
      winner: props.winner,
      reducedMotion: props.reducedMotion,
    }),
  )
  const flame = createMemo(() => fightFlame(props.a, props.b, frame()))
  const camera = createMemo(() => frame().camera)
  const beat = createMemo(() => frame().beat)
  const caption = createMemo(() =>
    beatCaption(beat(), { A: props.a.name, B: props.b.name }, props.winner),
  )
  const done = createMemo(() => frame().done)

  return (
    <div class={ui.stage}>
      <AutoCanvas
        class={ui.canvas}
        pixelRatio={props.renderScale}
        role="img"
        ariaLabel={`Flame Clash preview: ${props.a.name} against ${props.b.name}`}
      >
        <ClashScene
          flame={flame()}
          camera={camera()}
          pointCountPerBatch={props.pointCountPerBatch}
          onFirstFrame={onFirstFrame}
        />
      </AutoCanvas>
      <header class={ui.top}>
        <p class={ui.title}>
          Flame Clash <span class={ui.preview}>Preview</span>
        </p>
        <ul class={ui.fighters} aria-label="Fighters">
          <li style={{ '--team': TEAM_COLOUR.A.css }}>
            <span class={ui.badge}>A</span>
            {props.a.name}
          </li>
          <li style={{ '--team': TEAM_COLOUR.B.css }}>
            <span class={ui.badge}>B</span>
            {props.b.name}
          </li>
        </ul>
      </header>
      <p class={ui.caption} aria-live="polite" data-beat={beat()}>
        {caption()}
      </p>
      <div class={ui.controls}>
        <button
          type="button"
          class={ui.button}
          onClick={play}
          data-done={done() ? '' : undefined}
        >
          <Reset aria-hidden="true" />
          Replay
        </button>
        <button
          type="button"
          class={ui.button}
          aria-pressed={props.reducedMotion}
          onClick={() => {
            props.onReducedMotionChange(!props.reducedMotion)
          }}
        >
          Reduce motion
        </button>
        <button
          type="button"
          class={ui.button}
          hidden={!props.onChangeFighters}
          onClick={() => props.onChangeFighters?.()}
        >
          Change fighters
        </button>
      </div>
    </div>
  )
}

type ClashSceneProps = {
  flame: FlameDescriptor
  camera: ClashCamera
  pointCountPerBatch: number
  onFirstFrame: () => void
}

/** The camera and the renderer, inside the canvas so they can read its size. */
function ClashScene(props: ClashSceneProps) {
  const { canvasSize } = useCanvas()
  const camera3D = createMemo(() => {
    const { width, height } = canvasSize()
    return orbitCamera(props.camera, height > 0 ? width / height : 1)
  })
  return (
    <Default3DPreviewCamera camera3D={camera3D()}>
      <Flam3
        quality={0.995}
        pointCountPerBatch={props.pointCountPerBatch}
        renderInterval={1}
        adaptiveFilterEnabled={true}
        animationEnabled={false}
        flameDescriptor={props.flame}
        edgeFadeColor={NO_EDGE_FADE}
        onAccumulatedPointCount={(count) => {
          if (count > 0) props.onFirstFrame()
        }}
      />
    </Default3DPreviewCamera>
  )
}
