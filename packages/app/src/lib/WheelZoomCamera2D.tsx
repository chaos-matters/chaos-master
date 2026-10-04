import { batch, createEffect, createMemo, createSignal, onCleanup, } from 'solid-js'
import { vec2f } from 'typegpu/data'
import { clamp, sub } from 'typegpu/std'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { CAMERA_UNDO_DEBOUNCE_MS } from '@/defaults'
import { Camera2D } from '@/lib/Camera2D'
import { zoomedPosition } from '@/lib/camera2DView'
import { useCamera } from '@/lib/CameraContext'
import { useCanvas } from '@/lib/CanvasContext'
import { NO_SHIFT } from '@/lib/canvasFraming'
import { createDragHandler } from '@/utils/createDragHandler'
import { createPinchHandler } from '@/utils/createPinchHandler'
import { eventToClip } from '@/utils/eventToClip'
import type { ParentProps, Setter, Signal } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { ViewShift } from '@/lib/canvasFraming'

const SCROLL_SENSITIVITY = 0.001

type WheelZoomCamera2DProps = {
  zoom: Signal<number>
  position: Signal<v2f>
  /**
   * Radians. Read-only here: there is no rotate gesture, only keyframes.
   * Required for the reason `Camera2D.rotation` is — see its doc comment.
   */
  rotation: () => number
  /**
   * The view's framing shift, in clip units (Camera2D.viewShift). The
   * gestures need nothing of it: a pan moves the flame by the world distance
   * between two points both mapped through the shifted camera, and a zoom
   * keeps the world point under the pointer, so both come out the same with
   * the picture anywhere on the canvas (camera2DView.test.ts).
   */
  viewShift?: () => ViewShift
  eventTarget?: HTMLElement
  interactive?: () => boolean
}

export function createPosition(initPos: v2f): Signal<v2f> {
  const safeX = Number.isFinite(initPos?.x) ? initPos.x : 0
  const safeY = Number.isFinite(initPos?.y) ? initPos.y : 0
  const [position, _setPosition] = createSignal(vec2f(safeX, safeY))
  const setPosition: Setter<v2f> = (value) => {
    if (typeof value === 'function') {
      _setPosition((prev) => {
        const next = value(prev)
        return vec2f(
          Number.isFinite(next.x) ? next.x : prev.x,
          Number.isFinite(next.y) ? next.y : prev.y,
        )
      })
    } else {
      _setPosition(
        vec2f(
          Number.isFinite(value.x) ? value.x : 0,
          Number.isFinite(value.y) ? value.y : 0,
        ),
      )
    }
    return position()
  }

  return [position, setPosition]
}

export function createZoom(
  initZoom: number,
  zoomRange: [number, number],
): Signal<number> {
  const [min, max] = zoomRange
  const safeInit = Number.isFinite(initZoom) && initZoom > 0 ? initZoom : 1
  const [zoom, _setZoom] = createSignal(safeInit)

  const setZoom: Setter<number> = (value) => {
    if (typeof value === 'function') {
      _setZoom((prev) => {
        const next = value(prev)
        const safe = Number.isFinite(next) && next > 0 ? next : prev
        return clamp(safe, min, max)
      })
    } else {
      const safe = Number.isFinite(value) && value > 0 ? value : 1
      _setZoom(clamp(safe, min, max))
    }
    return zoom()
  }

  return [zoom, setZoom]
}

export function WheelZoomCamera2D(props: ParentProps<WheelZoomCamera2DProps>) {
  const { canvas } = useCanvas()
  const [zoom, setZoom] = props.zoom
  const [position, setPosition] = props.position
  const el = createMemo(() => props.eventTarget ?? canvas)
  const changeHistory = useChangeHistory()
  // An accessor rather than an inline `??` in the JSX below, which Solid
  // would wrap in a memo of its own (Default3DPreviewCamera in Camera3D.tsx
  // has the whole story).
  const viewShift = () => props.viewShift?.() ?? NO_SHIFT

  let clipToWorld: (clip: v2f) => v2f | undefined
  let wheelDebounceTimer: ReturnType<typeof setTimeout> | undefined
  const cancelPendingWheelCommit = () => {
    clearTimeout(wheelDebounceTimer)
    wheelDebounceTimer = undefined
  }

  const startPanning = createDragHandler((initEvent) => {
    const grabPosition = clipToWorld(eventToClip(initEvent, el()))
    if (
      !grabPosition ||
      !Number.isFinite(grabPosition.x) ||
      !Number.isFinite(grabPosition.y)
    ) {
      return
    }
    // A pan started within the wheel-commit debounce merges into the zoom's
    // preview — the pending timer would commit it MID-DRAG, after which every
    // move records its own history entry.
    cancelPendingWheelCommit()
    if (!changeHistory.isPreviewing()) {
      changeHistory.startPreview('Camera pan')
    }
    return {
      onPointerMove(event) {
        const pos = clipToWorld(eventToClip(event, el()))
        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
          return
        }
        setPosition((p) => {
          const delta = sub(pos, grabPosition)
          if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return p
          return sub(p, delta)
        })
      },
      onDone() {
        if (changeHistory.isPreviewing()) {
          changeHistory.commit()
        }
      },
    }
  })

  function zoomKeepPointInPlace(world: v2f, ratio: number) {
    if (
      !Number.isFinite(ratio) ||
      ratio <= 0 ||
      !Number.isFinite(world.x) ||
      !Number.isFinite(world.y)
    ) {
      return
    }
    const rawZoom = zoom()
    const oldZoom = Number.isFinite(rawZoom) && rawZoom > 0 ? rawZoom : 1
    batch(() => {
      const rawNew = setZoom(oldZoom * ratio)
      const newZoom = Number.isFinite(rawNew) && rawNew > 0 ? rawNew : oldZoom
      // actual ratio can be different due to min/max zoom level clamping
      const actualRatio = oldZoom / newZoom
      if (!Number.isFinite(actualRatio)) return
      setPosition(({ x, y }) => {
        const next = zoomedPosition({ x, y }, world, actualRatio)
        return vec2f(
          Number.isFinite(next.x) ? next.x : x,
          Number.isFinite(next.y) ? next.y : y,
        )
      })
    })
  }

  function onWheel(ev: WheelEvent) {
    ev.preventDefault()
    const clip = eventToClip(ev, el())
    const world = clipToWorld(clip)
    if (!world || !Number.isFinite(world.x) || !Number.isFinite(world.y)) {
      return
    }
    if (!changeHistory.isPreviewing()) {
      changeHistory.startPreview('Camera zoom')
    }
    const ratio = 1 - ev.deltaY * SCROLL_SENSITIVITY
    if (Number.isFinite(ratio) && ratio > 0) {
      zoomKeepPointInPlace(world, ratio)
    }
    cancelPendingWheelCommit()
    wheelDebounceTimer = setTimeout(() => {
      wheelDebounceTimer = undefined
      changeHistory.commit()
    }, CAMERA_UNDO_DEBOUNCE_MS)
  }

  const startPinch = createPinchHandler((initEvent) => {
    if (!Number.isFinite(initEvent.distance) || initEvent.distance <= 0) {
      return
    }
    const grabPosition = clipToWorld(eventToClip(initEvent.midpoint, el()))
    if (
      !grabPosition ||
      !Number.isFinite(grabPosition.x) ||
      !Number.isFinite(grabPosition.y)
    ) {
      return
    }
    let prevDistance = initEvent.distance
    cancelPendingWheelCommit()
    if (!changeHistory.isPreviewing()) {
      changeHistory.startPreview('Camera pinch')
    }
    return {
      onPinchMove(event) {
        if (
          !Number.isFinite(event.distance) ||
          event.distance <= 0 ||
          prevDistance <= 0
        ) {
          return
        }
        const pinchRatio = event.distance / prevDistance
        if (!Number.isFinite(pinchRatio) || pinchRatio <= 0) {
          return
        }
        const world = clipToWorld(eventToClip(event.midpoint, el()))
        if (!world || !Number.isFinite(world.x) || !Number.isFinite(world.y)) {
          return
        }
        setPosition((prev) => {
          const dx = world.x - grabPosition.x
          const dy = world.y - grabPosition.y
          if (!Number.isFinite(dx) || !Number.isFinite(dy)) return prev
          return vec2f(prev.x - dx, prev.y - dy)
        })
        zoomKeepPointInPlace(world, pinchRatio)
        prevDistance = event.distance
      },
      onDone() {
        if (changeHistory.isPreviewing()) {
          changeHistory.commit()
        }
      },
    }
  })

  createEffect(() => {
    const eventTarget = el()
    if (props.interactive?.() === false) {
      return
    }
    eventTarget.addEventListener('pointerdown', startPanning)
    eventTarget.addEventListener('touchmove', startPinch, { passive: false })
    eventTarget.addEventListener('wheel', onWheel, { passive: false })
    onCleanup(() => {
      eventTarget.removeEventListener('pointerdown', startPanning)
      eventTarget.removeEventListener('touchmove', startPinch)
      eventTarget.removeEventListener('wheel', onWheel)
      if (wheelDebounceTimer !== undefined) {
        clearTimeout(wheelDebounceTimer)
        wheelDebounceTimer = undefined
      }
      // Don't leave a preview orphaned when the effect re-runs or the
      // component unmounts during an active drag, pinch, or wheel zoom.
      if (changeHistory.isPreviewing()) {
        changeHistory.commit()
      }
    })
  })

  return (
    <Camera2D
      position={position()}
      zoom={zoom()}
      rotation={props.rotation()}
      viewShift={viewShift()}
    >
      {(() => {
        const { js } = useCamera()
        // steal clipToWorld from the camera
        clipToWorld = js.clipToWorld
        return null
      })()}
      {props.children}
    </Camera2D>
  )
}
