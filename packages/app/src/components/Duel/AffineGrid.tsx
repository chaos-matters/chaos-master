import { createSignal, For, Show } from 'solid-js'
import { composeAffine, decomposeAffine } from '@/arcade/affineControls'
import { basis3D, depthFromScreenDelta, ensure3DAffine, project3D, unproject3D, } from '@/flame/affine3DView'
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

type Handle = 'o' | 'x' | 'y' | 'z'

const HANDLES_2D = ['o', 'x', 'y'] as const satisfies readonly Handle[]
const HANDLES_3D = ['o', 'x', 'y', 'z'] as const satisfies readonly Handle[]

/** The 2D layout: `a,b,c` / `d,e,f`, translation in `c,f`. */
function points(affine: AffineParams) {
  const { a, b, c, d, e, f } = affine
  return {
    o: { x: c, y: f },
    x: { x: a + c, y: d + f },
    y: { x: b + c, y: e + f },
  }
}

/**
 * The same three handles plus a Z, flattened onto the fixed isometric the
 * workspace editor draws on — the same `project3D`, so the two diagrams of a
 * 3D transform agree.
 */
function points3D(affine: AffineParams) {
  const b = basis3D(affine)
  return {
    o: project3D(b.o.x, b.o.y, b.o.z),
    x: project3D(b.x.x, b.x.y, b.x.z),
    y: project3D(b.y.x, b.y.y, b.y.z),
    z: project3D(b.z.x, b.z.y, b.z.z),
  }
}

export function AffineGrid(props: {
  affine: AffineParams
  /** Every other transform, drawn behind so you can see what you are aiming at. */
  ghosts: readonly AffineParams[]
  /** Draw and drag the third axis. */
  is3D?: boolean
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
    const start = toWorld(ev)

    const move3D = (moveEv: PointerEvent) => {
      const screen = toWorld(moveEv)
      if (!screen || !start) return
      const current = ensure3DAffine(props.affine)
      const b = basis3D(current)
      const held = b[handle]
      /*
       * Two screen axes cannot decide three world ones, so a drag holds one.
       * Plain drag moves the handle in the projection plane at its own depth;
       * Shift drags along the projection's own diagonal and moves depth alone,
       * which is the only axis a flat gesture cannot otherwise reach.
       */
      const next = moveEv.shiftKey
        ? {
            x: held.x,
            y: held.y,
            z:
              held.z +
              depthFromScreenDelta(screen.x - start.x, screen.y - start.y),
          }
        : { ...unproject3D(screen.x, screen.y, held.z), z: held.z }

      if (handle === 'o') {
        props.onChange({ ...current, d: next.x, h: next.y, l: next.z })
        return
      }
      // The basis handles are vectors FROM the origin, so what a drag sets is
      // the difference, not the position.
      const o = b.o
      const v = { x: next.x - o.x, y: next.y - o.y, z: next.z - o.z }
      props.onChange(
        handle === 'x'
          ? { ...current, a: v.x, e: v.y, i: v.z }
          : handle === 'y'
            ? { ...current, b: v.x, f: v.y, j: v.z }
            : { ...current, c: v.x, g: v.y, k: v.z },
      )
    }

    const move = (moveEv: PointerEvent) => {
      if (props.is3D === true) {
        move3D(moveEv)
        return
      }
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
  // Always four entries, so the guide lines can index by handle whichever
  // dimension is in play; `z` sits on the origin in 2D and is never drawn.
  const P = (): Record<Handle, { x: number; y: number }> => {
    if (props.is3D === true) return points3D(props.affine)
    const flat = points(props.affine)
    return { ...flat, z: flat.o }
  }
  const tri = (affine: AffineParams) => {
    const p = props.is3D === true ? points3D(affine) : points(affine)
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
      <defs>
        {/*
          A neighbour's triangle can reach past the well, and cut square at the
          border it reads as a broken shape rather than as one continuing
          outside the frame. In user space deliberately: a CSS mask would be
          sized to each polygon's own bounding box and fade its outline instead
          of the rim.
        */}
        <radialGradient
          id="duel-grid-fade"
          gradientUnits="userSpaceOnUse"
          cx="0"
          cy="0"
          r={EXTENT}
        >
          <stop offset="0.62" stop-color="#fff" />
          <stop offset="0.88" stop-color="#fff" stop-opacity="0.45" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </radialGradient>
        <mask
          id="duel-grid-rim"
          maskUnits="userSpaceOnUse"
          x={-EXTENT}
          y={-EXTENT}
          width={EXTENT * 2}
          height={EXTENT * 2}
        >
          <rect
            x={-EXTENT}
            y={-EXTENT}
            width={EXTENT * 2}
            height={EXTENT * 2}
            fill="url(#duel-grid-fade)"
          />
        </mask>
      </defs>
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

        <g mask="url(#duel-grid-rim)">
          <For each={props.ghosts}>
            {(ghost) => <polygon class={ui.ghost} points={tri(ghost)} />}
          </For>
        </g>

        <polygon class={ui.shape} points={tri(props.affine)} />

        {/* The third axis is a spoke rather than a side: the triangle is the
            x/y face, and Z leaves it. */}
        <Show when={props.is3D === true}>
          <line
            class={ui.zSpoke}
            x1={P().o.x}
            y1={P().o.y}
            x2={P().z.x}
            y2={P().z.y}
          />
        </Show>

        <For each={props.is3D === true ? HANDLES_3D : HANDLES_2D}>
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
