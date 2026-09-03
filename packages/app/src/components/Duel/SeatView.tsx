import { vec4f } from 'typegpu/data'
import { DEFAULT_POINT_COUNT, DEFAULT_RENDER_INTERVAL_MS } from '@/defaults'
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
  interactive: boolean
}) {
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
            adaptiveFilterEnabled
            animationEnabled={false}
            flameDescriptor={props.flame()}
            edgeFadeColor={vec4f(0)}
          />
        </WheelZoomCamera2D>
      </AutoCanvas>
    </section>
  )
}
