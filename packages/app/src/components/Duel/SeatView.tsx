import { createMemo } from 'solid-js'
import { vec4f } from 'typegpu/data'
import { DEFAULT_POINT_COUNT, DEFAULT_RENDER_INTERVAL_MS } from '@/defaults'
import { palette as makePalette } from '@/flame/colorMap'
import { Flam3 } from '@/flame/Flam3'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import ui from './DuelStage.module.css'
import type { Accessor, Signal } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

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
        <WheelZoomCamera2D
          zoom={props.zoom}
          position={props.position}
          interactive={() => props.interactive}
        >
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
        </WheelZoomCamera2D>
      </AutoCanvas>
    </section>
  )
}
