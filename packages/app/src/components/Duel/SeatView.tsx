import { createMemo, Show } from 'solid-js'
import { vec4f } from 'typegpu/data'
import { DEFAULT_POINT_COUNT, DEFAULT_RENDER_INTERVAL_MS } from '@/defaults'
import { palette as makePalette } from '@/flame/colorMap'
import { Flam3 } from '@/flame/Flam3'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { WheelZoomCamera3D } from '@/lib/WheelZoomCamera3D'
import ui from './DuelStage.module.css'
import type { Accessor, Signal } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { Seat3DCamera } from '@/seats/seat'

/**
 * One half of the split screen: a live flame with its own camera.
 *
 * Both halves share the app's single GPU device — `<Flam3>` already mounts in
 * eighteen places — so this adds a canvas, not a renderer. Interaction is
 * gated per seat: the agent's half is not draggable.
 */
export function SeatView(props: {
  label: string
  /** This seat's standing, shown on the name pill. */
  score: number
  side: 'player' | 'rival'
  flame: Accessor<FlameDescriptor>
  zoom: Signal<number>
  position: Signal<v2f>
  /** The same seat's 3D camera, bound when the flame is 3D. */
  camera3D: Seat3DCamera
  quality: number
  /** The viewer's own filter settings, so a seat matches their workspace. */
  adaptiveFilter: boolean
  stochasticFilter: boolean
  interactive: boolean
}) {
  /*
   * `Flam3` takes the palette as a prop and ignores the descriptor's own —
   * `paletteEntryCount` comes from `props.palette()` and nothing else. Without
   * this the seats rendered every flame on the default colour map, so a
   * palette picked from the Colour panel changed the stored flame, showed up
   * in the exported card, and did nothing at all on screen.
   *
   * The descriptor stores a palette without the provenance a `Palette`
   * carries, so it is rebuilt rather than cast, exactly as `FlameStill` does.
   */
  const seatPalette = createMemo(() => {
    const stored = props.flame().renderSettings.palette
    return stored
      ? makePalette(stored.id, stored.name, stored.entries, 'custom')
      : undefined
  })

  // Free per seat: each side orbits its own flame. The viewer's half is
  // theirs, and the agent reframing its own flame is part of what it is
  // showing off — so the two cameras are independent rather than locked.
  const is3D = () => (props.flame().renderSettings.dimensions ?? 2) === 3

  // A component, not a hoisted JSX value: JSX in a variable is evaluated where
  // it is written, which would put `Flam3` outside the camera it needs.
  const FlameLayer = () => (
    <Flam3
      quality={props.quality}
      pointCountPerBatch={DEFAULT_POINT_COUNT}
      renderInterval={DEFAULT_RENDER_INTERVAL_MS}
      adaptiveFilterEnabled={props.adaptiveFilter}
      stochasticFilterEnabled={props.stochasticFilter}
      animationEnabled={false}
      flameDescriptor={props.flame()}
      edgeFadeColor={vec4f(0)}
      palette={seatPalette}
    />
  )

  return (
    <section class={ui.seat} aria-label={props.label}>
      <h3
        class={ui.seatLabel}
        classList={{
          [ui.playerLabel!]: props.side === 'player',
          [ui.rivalLabel!]: props.side === 'rival',
        }}
      >
        {props.label}
        {/* The number rides with the name rather than on the dial: the dial
            says who is ahead by how much of the ring each side owns, which is
            the comparison; this is the figure, and it belongs to a flame. */}
        <span class={ui.seatScore}>{props.score}</span>
      </h3>
      <AutoCanvas
        class={ui.seatCanvas}
        role="img"
        ariaLabel={`${props.label}: fractal flame`}
      >
        <Show
          when={is3D()}
          fallback={
            <WheelZoomCamera2D
              zoom={props.zoom}
              position={props.position}
              interactive={() => props.interactive}
            >
              <FlameLayer />
            </WheelZoomCamera2D>
          }
        >
          <WheelZoomCamera3D
            theta={props.camera3D.theta}
            phi={props.camera3D.phi}
            radius={props.camera3D.radius}
            target={props.camera3D.target}
            fov={props.camera3D.fov}
            roll={props.camera3D.roll}
            interactive={() => props.interactive}
          >
            <FlameLayer />
          </WheelZoomCamera3D>
        </Show>
      </AutoCanvas>
    </section>
  )
}
