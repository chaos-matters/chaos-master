import { createSignal } from 'solid-js'
import { createDragHandler } from '@/utils/createDragHandler'
import ui from './OrientationGizmo.module.css'
import type { Signal } from 'solid-js'

const ORBIT_SENSITIVITY = 0.008
const SNAP_DURATION = 300 // ms

type OrientationGizmoProps = {
  theta: Signal<number>
  phi: Signal<number>
}

// Axis definitions: name, color, 3D unit direction
const AXES = [
  { name: 'X', color: '#E74C3C', dir: [1, 0, 0] as const },
  { name: 'Y', color: '#2ECC71', dir: [0, 1, 0] as const },
  { name: 'Z', color: '#3498DB', dir: [0, 0, 1] as const },
] as const

/** Snap views: clicking an axis label snaps the camera to look along that axis */
const SNAP_VIEWS: Record<string, { theta: number; phi: number }> = {
  '+X': { theta: Math.PI / 2, phi: Math.PI / 2 },
  '-X': { theta: -Math.PI / 2, phi: Math.PI / 2 },
  '+Y': { theta: 0, phi: 0.01 },
  '-Y': { theta: 0, phi: Math.PI - 0.01 },
  '+Z': { theta: 0, phi: Math.PI / 2 },
  '-Z': { theta: Math.PI, phi: Math.PI / 2 },
}

/** Project a 3D unit vector to 2D gizmo coordinates using camera theta/phi */
function project(
  dir: readonly [number, number, number],
  theta: number,
  phi: number,
): { x: number; y: number; z: number } {
  // Camera looks from spherical (theta, phi) toward the origin.
  // We need the view-space projection of each axis.
  const st = Math.sin(theta)
  const ct = Math.cos(theta)
  const sp = Math.sin(phi)
  const cp = Math.cos(phi)

  // Right vector (camera X)
  const rx = ct
  const rz = -st

  // Up vector (camera Y) = right × forward
  const ux = -cp * st
  const uy = sp
  const uz = -cp * ct

  // Forward vector (into screen, camera Z)
  const fx = -sp * st
  const fy = -cp
  const fz = -sp * ct

  const x = dir[0] * rx + dir[1] * 0 + dir[2] * rz
  const y = -(dir[0] * ux + dir[1] * uy + dir[2] * uz)
  const z = dir[0] * fx + dir[1] * fy + dir[2] * fz

  return { x, y, z }
}

export function OrientationGizmo(props: OrientationGizmoProps) {
  const CX = 40 // SVG center
  const CY = 40
  const AXIS_LEN = 25 // px from center to axis endpoint

  const [animating, setAnimating] = createSignal(false)

  // Smooth snap animation
  function snapTo(targetTheta: number, targetPhi: number) {
    const startTheta = props.theta[0]()
    const startPhi = props.phi[0]()
    const startTime = globalThis.performance.now()
    setAnimating(true)

    function tick() {
      const elapsed = globalThis.performance.now() - startTime
      const t = Math.min(1, elapsed / SNAP_DURATION)
      // Ease out cubic
      const e = 1 - (1 - t) ** 3
      props.theta[1](startTheta + (targetTheta - startTheta) * e)
      props.phi[1](startPhi + (targetPhi - startPhi) * e)
      if (t < 1) {
        requestAnimationFrame(tick)
      } else {
        setAnimating(false)
      }
    }
    requestAnimationFrame(tick)
  }

  // Drag-to-orbit on the gizmo itself
  const startOrbit = createDragHandler((initEvent) => {
    return {
      onPointerMove(event) {
        const dx = event.clientX - initEvent.clientX
        const dy = event.clientY - initEvent.clientY
        props.theta[1]((t) => t - dx * ORBIT_SENSITIVITY)
        props.phi[1]((p) => {
          const next = p - dy * ORBIT_SENSITIVITY
          return Math.max(0.01, Math.min(Math.PI - 0.01, next))
        })
        initEvent = event
      },
      onDone() {
        // no-op
      },
    }
  })

  // Compute projected axis positions reactively
  function getAxes() {
    const theta = props.theta[0]()
    const phi = props.phi[0]()

    return AXES.map((axis) => {
      const pos = project(axis.dir, theta, phi)
      const neg = project(
        [-axis.dir[0], -axis.dir[1], -axis.dir[2]] as const,
        theta,
        phi,
      )
      return {
        ...axis,
        px: CX + pos.x * AXIS_LEN,
        py: CY + pos.y * AXIS_LEN,
        pz: pos.z,
        nx: CX + neg.x * AXIS_LEN,
        ny: CY + neg.y * AXIS_LEN,
        nz: neg.z,
      }
    })
  }

  return (
    <div class={ui.gizmoContainer}>
      <svg
        class={ui.gizmo}
        viewBox="0 0 80 80"
        onPointerDown={(ev) => {
          if (!animating()) startOrbit(ev)
        }}
      >
        {/* Background disc */}
        <circle class={ui.backgroundDisc} cx={CX} cy={CY} r={36} />

        {/* Render in layers so labels are never occluded by lines */}
        {(() => {
          const axes = getAxes()
          // Sort axes by depth for each layer (back to front)
          const byLineZ = [...axes].sort(
            (a, b) => (a.pz + a.nz) / 2 - (b.pz + b.nz) / 2,
          )
          const byNegZ = [...axes].sort((a, b) => a.nz - b.nz)
          const byPosZ = [...axes].sort((a, b) => a.pz - b.pz)

          return (
            <>
              {/* Layer 1: Lines (back to front) */}
              {byLineZ.map((axis) => (
                <line
                  class={ui.axisLine}
                  x1={axis.nx}
                  y1={axis.ny}
                  x2={axis.px}
                  y2={axis.py}
                  stroke={axis.color}
                />
              ))}
              {/* Layer 2: Negative endpoints (back to front) */}
              {byNegZ.map((axis) => (
                <circle
                  class={ui.negativeEndpoint}
                  cx={axis.nx}
                  cy={axis.ny}
                  r={4}
                  fill={axis.color}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    const view = SNAP_VIEWS[`-${axis.name}`]!
                    snapTo(view.theta, view.phi)
                  }}
                />
              ))}
              {/* Layer 3: Positive endpoints with labels (back to front) */}
              {byPosZ.map((axis) => (
                <g
                  onClick={(ev) => {
                    ev.stopPropagation()
                    const view = SNAP_VIEWS[`+${axis.name}`]!
                    snapTo(view.theta, view.phi)
                  }}
                >
                  <circle
                    class={ui.axisEndpoint}
                    cx={axis.px}
                    cy={axis.py}
                    r={7}
                    fill={axis.color}
                  />
                  <text class={ui.axisLabel} x={axis.px} y={axis.py}>
                    {axis.name}
                  </text>
                </g>
              ))}
            </>
          )
        })()}
      </svg>
    </div>
  )
}
