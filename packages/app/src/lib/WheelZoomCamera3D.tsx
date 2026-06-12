import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { Camera3D } from '@/lib/Camera3D'
import { useCamera3D } from '@/lib/Camera3DContext'
import { useCanvas } from '@/lib/CanvasContext'
import { createDragHandler } from '@/utils/createDragHandler'
import { createPinchHandler } from '@/utils/createPinchHandler'
import type { ParentProps, Signal } from 'solid-js'
import type { Vec3 } from 'wgpu-matrix'

const ORBIT_SENSITIVITY = 0.005
const SCROLL_SENSITIVITY = 0.001
const KEY_PAN_SPEED = 1.3 // Camera pan speed (units per second at radius = 1)

type WheelZoomCamera3DProps = {
  theta: Signal<number>
  phi: Signal<number>
  radius: Signal<number>
  target: Signal<Vec3>
  fov: Signal<number>
  eventTarget?: HTMLElement
  interactive?: () => boolean
}

export function createSpherical(
  initTheta: number,
  initPhi: number,
  initRadius: number,
  initTarget: Vec3,
  initFov: number,
) {
  const [theta, setTheta] = createSignal(initTheta)
  const [phi, setPhi] = createSignal(initPhi)
  const [radius, setRadius] = createSignal(initRadius)
  const [target, setTarget] = createSignal(initTarget)
  const [fov, setFov] = createSignal(initFov)

  return {
    theta: [theta, setTheta] as Signal<number>,
    phi: [phi, setPhi] as Signal<number>,
    radius: [radius, setRadius] as Signal<number>,
    target: [target, setTarget] as Signal<Vec3>,
    fov: [fov, setFov] as Signal<number>,
  }
}

export function WheelZoomCamera3D(props: ParentProps<WheelZoomCamera3DProps>) {
  const { canvas } = useCanvas()
  const el = createMemo(() => props.eventTarget ?? canvas)
  const changeHistory = useChangeHistory()

  let _clipToWorld: ((pos: Vec3) => Vec3) | undefined

  const position = createMemo(() => {
    const t = props.theta[0]()
    const p = props.phi[0]()
    const r = props.radius[0]()
    const tgt = props.target[0]()
    const x = tgt[0]! + r * Math.sin(p) * Math.sin(t)
    const y = tgt[1]! + r * Math.cos(p)
    const z = tgt[2]! + r * Math.sin(p) * Math.cos(t)
    return new Float32Array([x, y, z])
  })

  const startOrbit = createDragHandler((initEvent) => {
    if (!changeHistory.isPreviewing()) {
      changeHistory.startPreview('Camera orbit')
    }
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
        if (changeHistory.isPreviewing()) {
          changeHistory.commit()
        }
      },
    }
  })

  const startPanning = createDragHandler((initEvent) => {
    if (!changeHistory.isPreviewing()) {
      changeHistory.startPreview('Camera pan')
    }
    return {
      onPointerMove(event) {
        const dx = event.clientX - initEvent.clientX
        const dy = event.clientY - initEvent.clientY
        const tgt = props.target[0]()
        const pos = position()
        const fwd = new Float32Array([
          tgt[0]! - pos[0]!,
          tgt[1]! - pos[1]!,
          tgt[2]! - pos[2]!,
        ])
        const ff0 = fwd[0]!
        const ff1 = fwd[1]!
        const ff2 = fwd[2]!
        const fLen = Math.sqrt(ff0 * ff0 + ff1 * ff1 + ff2 * ff2)
        fwd[0] = ff0 / fLen
        fwd[1] = ff1 / fLen
        fwd[2] = ff2 / fLen
        const up = [0, 1, 0] as const
        const rgt = new Float32Array([
          ff1 * up[2] - ff2 * up[1],
          ff2 * up[0] - ff0 * up[2],
          ff0 * up[1] - ff1 * up[0],
        ])
        const rg0 = rgt[0]!
        const rg1 = rgt[1]!
        const rg2 = rgt[2]!
        const rLen = Math.sqrt(rg0 * rg0 + rg1 * rg1 + rg2 * rg2)
        rgt[0] = rg0 / rLen
        rgt[1] = rg1 / rLen
        rgt[2] = rg2 / rLen
        const camUp = new Float32Array([
          rg1 * ff2 - rg2 * ff1,
          rg2 * ff0 - rg0 * ff2,
          rg0 * ff1 - rg1 * ff0,
        ])
        const cu0 = camUp[0]!
        const cu1 = camUp[1]!
        const cu2 = camUp[2]!
        const panSpeed = props.radius[0]() * 0.001
        props.target[1]((tgt) => {
          const rx = rg0 * -dx * panSpeed + cu0 * dy * panSpeed
          const ry = rg1 * -dx * panSpeed + cu1 * dy * panSpeed
          const rz = rg2 * -dx * panSpeed + cu2 * dy * panSpeed
          return new Float32Array([tgt[0]! + rx, tgt[1]! + ry, tgt[2]! + rz])
        })
        initEvent = event
      },
      onDone() {
        if (changeHistory.isPreviewing()) {
          changeHistory.commit()
        }
      },
    }
  })

  function onWheel(ev: WheelEvent) {
    ev.preventDefault()
    if (!changeHistory.isPreviewing()) {
      changeHistory.startPreview('Camera zoom')
    }
    props.radius[1]((r) =>
      Math.max(0.01, Math.min(100, r * (1 + ev.deltaY * SCROLL_SENSITIVITY))),
    )
    setTimeout(() => {
      changeHistory.commit()
    }, 300)
  }

  const startPinch = createPinchHandler((initEvent) => {
    let prevDistance = initEvent.distance
    if (!changeHistory.isPreviewing()) {
      changeHistory.startPreview('Camera pinch')
    }
    return {
      onPinchMove(event) {
        const ratio = event.distance / prevDistance
        props.radius[1]((r) => Math.max(0.01, Math.min(100, r / ratio)))
        prevDistance = event.distance
      },
      onDone() {
        if (changeHistory.isPreviewing()) {
          changeHistory.commit()
        }
      },
    }
  })

  function onPointerDown(ev: PointerEvent) {
    // Middle-click or right-click → pan
    if (ev.button === 1 || ev.button === 2) {
      ev.preventDefault()
      startPanning(ev)
    } else {
      startOrbit(ev)
    }
  }

  function onContextMenu(ev: MouseEvent) {
    ev.preventDefault()
  }

  /** Compute camera right & up vectors from current spherical coords. */
  function getCameraAxes() {
    const t = props.theta[0]()
    const p = props.phi[0]()
    // Forward = target - position (normalised)
    const fx = -Math.sin(p) * Math.sin(t)
    const fy = -Math.cos(p)
    const fz = -Math.sin(p) * Math.cos(t)
    // Right = forward × worldUp, where worldUp = (0,1,0)
    const rx = -fz
    const rz = fx
    const rLen = Math.sqrt(rx * rx + rz * rz) || 1
    const nrx = rx / rLen
    const nrz = rz / rLen
    // CamUp = right × forward
    const ux = 0 * fz - nrz * fy
    const uy = nrz * fx - nrx * fz
    const uz = nrx * fy - 0 * fx
    const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1
    return {
      right: [nrx, 0, nrz] as const,
      up: [ux / uLen, uy / uLen, uz / uLen] as const,
      forward: [fx, fy, fz] as const,
    }
  }

  const activeKeys = new Set<string>()
  let keyLoopId: number | null = null
  let lastTime = 0

  function startKeyLoop() {
    if (keyLoopId !== null) return
    if (!changeHistory.isPreviewing()) {
      changeHistory.startPreview('Camera pan')
    }
    lastTime = globalThis.performance.now()
    keyLoopId = requestAnimationFrame(keyLoop)
  }

  function keyLoop(now: number) {
    if (activeKeys.size === 0) {
      keyLoopId = null
      changeHistory.commit()
      return
    }

    const deltaTime = (now - lastTime) / 1000 // in seconds
    lastTime = now

    const radius = props.radius[0]()
    const speed = radius * KEY_PAN_SPEED * deltaTime

    const { right, up } = getCameraAxes()
    let dx = 0
    let dy = 0

    if (activeKeys.has('w') || activeKeys.has('arrowup')) dy += speed
    if (activeKeys.has('s') || activeKeys.has('arrowdown')) dy -= speed
    if (activeKeys.has('a') || activeKeys.has('arrowleft')) dx -= speed
    if (activeKeys.has('d') || activeKeys.has('arrowright')) dx += speed

    if (dx !== 0 || dy !== 0) {
      props.target[1]((tgt) => {
        return new Float32Array([
          tgt[0]! + right[0] * dx + up[0] * dy,
          tgt[1]! + right[1] * dx + up[1] * dy,
          tgt[2]! + right[2] * dx + up[2] * dy,
        ])
      })
    }

    keyLoopId = requestAnimationFrame(keyLoop)
  }

  function onKeyDown(ev: KeyboardEvent) {
    // Don't capture when typing in inputs
    const tag = (ev.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    const key = ev.key.toLowerCase()
    if (
      [
        'w',
        's',
        'a',
        'd',
        'arrowup',
        'arrowdown',
        'arrowleft',
        'arrowright',
      ].includes(key)
    ) {
      ev.preventDefault()
      activeKeys.add(key)
      startKeyLoop()
    }
  }

  function onKeyUp(ev: KeyboardEvent) {
    const key = ev.key.toLowerCase()
    if (activeKeys.has(key)) {
      activeKeys.delete(key)
    }
  }

  createEffect(() => {
    const eventTarget = el()
    if (props.interactive?.() === false) {
      return
    }
    eventTarget.addEventListener('pointerdown', onPointerDown)
    eventTarget.addEventListener('contextmenu', onContextMenu)
    eventTarget.addEventListener('touchmove', startPinch, { passive: false })
    eventTarget.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    onCleanup(() => {
      eventTarget.removeEventListener('pointerdown', onPointerDown)
      eventTarget.removeEventListener('contextmenu', onContextMenu)
      eventTarget.removeEventListener('touchmove', startPinch)
      eventTarget.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (keyLoopId !== null) {
        cancelAnimationFrame(keyLoopId)
        keyLoopId = null
      }
      activeKeys.clear()
      if (changeHistory.isPreviewing()) {
        changeHistory.commit()
      }
    })
  })

  return (
    <Camera3D
      position={position()}
      target={props.target[0]()}
      fov={props.fov[0]()}
    >
      {(() => {
        const { js } = useCamera3D()
        _clipToWorld = js.worldToClip
        return null
      })()}
      {props.children}
    </Camera3D>
  )
}
