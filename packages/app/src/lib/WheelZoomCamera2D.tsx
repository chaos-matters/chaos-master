import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from 'solid-js'
import { vec2f } from 'typegpu/data'
import { clamp, sub } from 'typegpu/std'
import { Camera2D } from '@/lib/Camera2D'
import { useCamera } from '@/lib/CameraContext'
import { useCanvas } from '@/lib/CanvasContext'
import { createDragHandler } from '@/utils/createDragHandler'
import { createPinchHandler } from '@/utils/createPinchHandler'
import { eventToClip } from '@/utils/eventToClip'
import type { ParentProps, Setter, Signal } from 'solid-js'
import type { v2f } from 'typegpu/data'

const SCROLL_SENSITIVITY = 0.001

type WheelZoomCamera2DProps = {
  zoom: Signal<number>
  position: Signal<v2f>
  eventTarget?: HTMLElement
}

export function createPosition(initPos: v2f): Signal<v2f> {
  const [position, _setPosition] = createSignal(initPos)
  const setPosition: Setter<v2f> = (value) => {
    if (typeof value === 'function') {
      _setPosition((prev) => {
        return value(prev)
      })
    } else {
      _setPosition(value)
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
  const [zoom, _setZoom] = createSignal(initZoom)

  const setZoom: Setter<number> = (value) => {
    if (typeof value === 'function') {
      _setZoom((prev) => {
        return clamp(value(prev), min, max)
      })
    } else {
      _setZoom(clamp(value, min, max))
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

  let clipToWorld: (clip: v2f) => v2f | undefined

  const startPanning = createDragHandler((initEvent) => {
    const grabPosition = clipToWorld(eventToClip(initEvent, el()))
    if (!grabPosition) {
      return
    }
    return {
      onPointerMove(event) {
        const pos = clipToWorld(eventToClip(event, el()))
        if (!pos) {
          return
        }
        setPosition((p) => sub(p, sub(pos, grabPosition)))
      },
    }
  })

  function zoomKeepPointInPlace(world: v2f, ratio: number) {
    const oldZoom = zoom()
    batch(() => {
      const newZoom = setZoom(oldZoom * ratio)
      // actual ratio can be different due to min/max zoom level clamping
      const actualRatio = oldZoom / newZoom
      setPosition(({ x, y }) =>
        vec2f(
          x + (world.x - x) * (1 - actualRatio),
          y + (world.y - y) * (1 - actualRatio),
        ),
      )
    })
  }

  function onWheel(ev: WheelEvent) {
    ev.preventDefault()
    const clip = eventToClip(ev, el())
    const world = clipToWorld(clip)
    if (!world) {
      return
    }
    zoomKeepPointInPlace(world, 1 - ev.deltaY * SCROLL_SENSITIVITY)
  }

  const startPinch = createPinchHandler((initEvent) => {
    const grabPosition = clipToWorld(eventToClip(initEvent.midpoint, el()))
    if (!grabPosition) {
      return
    }
    let prevDistance = initEvent.distance
    return {
      onPinchMove(event) {
        const pinchRatio = event.distance / prevDistance
        const world = clipToWorld(eventToClip(event.midpoint, el()))
        if (!world) {
          return
        }
        setPosition((prev) => sub(prev, sub(world, grabPosition)))
        zoomKeepPointInPlace(world, pinchRatio)
        prevDistance = event.distance
      },
    }
  })

  createEffect(() => {
    const eventTarget = el()
    eventTarget.addEventListener('pointerdown', startPanning)
    eventTarget.addEventListener('touchmove', startPinch)
    eventTarget.addEventListener('wheel', onWheel, { passive: false })
    onCleanup(() => {
      eventTarget.removeEventListener('pointerdown', startPanning)
      eventTarget.removeEventListener('touchmove', startPinch)
      eventTarget.removeEventListener('wheel', onWheel)
    })
  })

  return (
    <Camera2D position={position()} zoom={zoom()}>
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
