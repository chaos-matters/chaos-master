import { createSignal, For, Show } from 'solid-js'
import { composeAffine, decomposeAffine } from '@/arcade/affineControls'
import ui from './AffineGrid.module.css'
import type { AffineParams } from '@/flame/affineTranform'

/**
 * The transform as a shape you can grab.
 *
 * Deliberately not the workspace's `AffineEditor`. That one draws its grid
 * with a WGSL shader and positions its handles from GPU uniform buffers, so
 * its SVG cannot be lifted away from the canvas — reusing it would mean a
 * fourth live WebGPU context and a per-frame render loop running beside the
 * two seat canvases that are the entire point of the mode. Here the world-to-
 * view map is a fixed scale chosen in JS, so this costs nothing to draw.
 *
 * Handles are the classic basis points rather than three interchangeable
 * vertices: O moves the transform, X and Y are the images of the unit vectors.
 * That is what the numbers underneath mean, so dragging and scrubbing stay the
 * same two views of one thing.
 */

/** World units visible across the box, so a unit transform sits comfortably. */
const EXTENT = 1.6
const GRID_STEP = 0.2

type Handle = 'o' | 'x' | 'y'

function points(affine: AffineParams) {
  const { a, b, c, d, e, f } = affine
  return {
    o: { x: c, y: f },
    x: { x: a + c, y: d + f },
    y: { x: b + c, y: e + f },
  }
}

export function AffineGrid(props: {
  affine: AffineParams
  /** Every other transform, drawn behind so you can see what you are aiming at. */
  ghosts: readonly AffineParams[]
  onChange: (affine: AffineParams) => void
  onCommit?: () => void
}) {
  const [dragging, setDragging] = createSignal<Handle | undefined>()
  let svgEl: SVGSVGElement | undefined

  /** Pointer position in world units. */
  const toWorld = (ev: PointerEvent) => {
    const box = svgEl?.getBoundingClientRect()
    if (!box) return undefined
    const nx = (ev.clientX - box.left) / box.width
    const ny = (ev.clientY - box.top) / box.height
    return {
      x: (nx * 2 - 1) * EXTENT,
      // Screen y grows downward; the flame's does not.
      y: -(ny * 2 - 1) * EXTENT,
    }
  }

  const drag = (handle: Handle) => (ev: PointerEvent) => {
    ev.preventDefault()
    ev.stopPropagation()
    setDragging(handle)
    const target = ev.currentTarget as Element
    target.setPointerCapture(ev.pointerId)

    const move = (moveEv: PointerEvent) => {
      const world = toWorld(moveEv)
      if (!world) return
      const current = props.affine
      const origin = { x: current.c, y: current.f }
      if (handle === 'o') {
        props.onChange({ ...current, c: world.x, f: world.y })
        return
      }
      // X and Y are vectors FROM the origin, which is why the drag is a
      // difference and not a position.
      const vx = world.x - origin.x
      const vy = world.y - origin.y
      props.onChange(
        handle === 'x'
          ? { ...current, a: vx, d: vy }
          : { ...current, b: vx, e: vy },
      )
    }
    const up = () => {
      setDragging(undefined)
      target.releasePointerCapture(ev.pointerId)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      props.onCommit?.()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // SVG space: the box is 2*EXTENT wide, centred, y flipped once on the group.
  const P = () => points(props.affine)
  const tri = (affine: AffineParams) => {
    const p = points(affine)
    return `${p.o.x},${p.o.y} ${p.x.x},${p.x.y} ${p.y.x},${p.y.y}`
  }
  const lines = () => {
    const out: number[] = []
    for (let v = -EXTENT; v <= EXTENT + 1e-9; v += GRID_STEP) {
      out.push(Number(v.toFixed(4)))
    }
    return out
  }

  return (
    <svg
      ref={svgEl}
      class={ui.grid}
      viewBox={`${-EXTENT} ${-EXTENT} ${EXTENT * 2} ${EXTENT * 2}`}
      aria-label="Transform shape"
    >
      {/* One flip, so every coordinate below is in flame space. */}
      <g transform="scale(1,-1)">
        <g class={ui.rules}>
          <For each={lines()}>
            {(v) => (
              <>
                <line x1={v} y1={-EXTENT} x2={v} y2={EXTENT} />
                <line x1={-EXTENT} y1={v} x2={EXTENT} y2={v} />
              </>
            )}
          </For>
        </g>
        <g class={ui.axes}>
          <line x1={-EXTENT} y1="0" x2={EXTENT} y2="0" />
          <line x1="0" y1={-EXTENT} x2="0" y2={EXTENT} />
        </g>

        <For each={props.ghosts}>
          {(ghost) => <polygon class={ui.ghost} points={tri(ghost)} />}
        </For>

        <polygon class={ui.shape} points={tri(props.affine)} />

        <For each={['o', 'x', 'y'] as const}>
          {(handle) => (
            <g
              class={ui.handle}
              classList={{ [ui.handleOn!]: dragging() === handle }}
              onPointerDown={drag(handle)}
            >
              <circle
                class={handle === 'o' ? ui.handleCore : ui.handleRing}
                cx={P()[handle].x}
                cy={P()[handle].y}
                r={dragging() === handle ? 0.24 : 0.144}
              />
              {/* A fat invisible target, because 0.1 world units is a small
                  thing to hit with a finger. */}
              <circle
                class={ui.handleHit}
                cx={P()[handle].x}
                cy={P()[handle].y}
                r={0.22}
              />
            </g>
          )}
        </For>

        <Show when={dragging()}>
          {(handle) => (
            <g class={ui.guides}>
              <line
                x1={P()[handle()].x}
                y1={P()[handle()].y}
                x2="0"
                y2={P()[handle()].y}
              />
              <line
                x1={P()[handle()].x}
                y1={P()[handle()].y}
                x2={P()[handle()].x}
                y2="0"
              />
            </g>
          )}
        </Show>
      </g>
    </svg>
  )
}

/** Identity, keeping any 3D coefficients the transform already carries. */
export function resetAffine(keep: AffineParams): AffineParams {
  return composeAffine(
    { scaleX: 1, scaleY: 1, rotation: 0, shear: 0, offsetX: 0, offsetY: 0 },
    keep,
  )
}

export { decomposeAffine }
