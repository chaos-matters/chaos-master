import { createEffect, createMemo, createSignal, untrack } from 'solid-js'
import { vec2f } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import { MAX_CAMERA_ZOOM_VALUE, MIN_CAMERA_ZOOM_VALUE, } from '@/flame/schema/flameSchema'
import { persistentSignal } from '@/utils/persistentSignal'
import type { Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { Vec3 } from 'wgpu-matrix'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export interface UseWorkspaceCameraParams {
  flameDescriptor: FlameDescriptor
  setRenderSetting: (path: string, value: unknown) => void
  timeline: {
    isDrivingView: () => boolean
    resolveValueAtPath: (path: string, frame: number) => unknown
    currentFrame: () => number
  }
  setSilently: (updater: (draft: FlameDescriptor) => void) => void
}

export function useWorkspaceCamera(params: UseWorkspaceCameraParams) {
  const { flameDescriptor, setRenderSetting, timeline, setSilently } = params

  const setFlameZoom: Setter<number> = (value) => {
    const current = flameDescriptor.renderSettings.camera.zoom
    const next = clamp(
      typeof value === 'function' ? value(current) : value,
      MIN_CAMERA_ZOOM_VALUE,
      MAX_CAMERA_ZOOM_VALUE,
    )
    setRenderSetting('camera.zoom', next)
    return flameDescriptor.renderSettings.camera.zoom
  }

  const setFlamePosition: Setter<v2f> = (value) => {
    const current = vec2f(...flameDescriptor.renderSettings.camera.position)
    const next = typeof value === 'function' ? value(current) : value
    setRenderSetting('camera.position', [next.x, next.y])
    return flameDescriptor.renderSettings.camera.position
  }

  function makeCamera3DSetter(
    field: 'theta' | 'phi' | 'radius' | 'fov' | 'roll',
  ): Setter<number> {
    return (value) => {
      const current = flameDescriptor.renderSettings.camera3D[field]
      const next =
        typeof value === 'function'
          ? (value as (p: number) => number)(current)
          : value
      setRenderSetting(`camera3D.${field}`, next)
      return flameDescriptor.renderSettings.camera3D[field]
    }
  }

  const setFlameTheta = makeCamera3DSetter('theta')
  const setFlamePhi = makeCamera3DSetter('phi')
  const setFlameRadius = makeCamera3DSetter('radius')

  const autoExposureTarget = createMemo<number | null>(() => {
    const rs = flameDescriptor.renderSettings
    if (!rs.autoExposure3D || (rs.dimensions ?? 2) !== 3) return null
    const radius = rs.camera3D?.radius ?? 0
    const ref = rs.autoExposure3DRefRadius
    if (radius <= 0 || ref <= 0) return null
    return (
      rs.autoExposure3DBase + rs.autoExposure3DStrength * Math.log(radius / ref)
    )
  })

  createEffect(() => {
    const target = autoExposureTarget()
    if (target === null) return
    const current = untrack(() => flameDescriptor.renderSettings.exposure)
    if (Math.abs(target - current) > 1e-4) {
      setSilently((draft) => {
        draft.renderSettings.exposure = target
      })
    }
  })

  const setFlameTarget3D = (value: Vec3 | ((prev: Vec3) => Vec3)) => {
    const current = new Float32Array(
      flameDescriptor.renderSettings.camera3D.target,
    )
    const newTarget = typeof value === 'function' ? value(current) : value
    setRenderSetting('camera3D.target', [
      newTarget[0] ?? 0,
      newTarget[1] ?? 0,
      newTarget[2] ?? 0,
    ])
    return new Float32Array(flameDescriptor.renderSettings.camera3D.target)
  }

  const setFlameFov = makeCamera3DSetter('fov')
  const setFlameRoll = makeCamera3DSetter('roll')

  const [flyMode, setFlyMode] = createSignal(false)
  const flySpeed = persistentSignal('camera3D/fly-speed', 1)

  const effectiveTheta = () => {
    if (timeline.isDrivingView()) {
      const val = timeline.resolveValueAtPath(
        'camera3D.theta',
        timeline.currentFrame(),
      )
      if (val !== null && typeof val === 'number') return val
    }
    return flameDescriptor.renderSettings.camera3D.theta
  }

  const effectivePhi = () => {
    if (timeline.isDrivingView()) {
      const val = timeline.resolveValueAtPath(
        'camera3D.phi',
        timeline.currentFrame(),
      )
      if (val !== null && typeof val === 'number') return val
    }
    return flameDescriptor.renderSettings.camera3D.phi
  }

  const effectiveRadius = () => {
    if (timeline.isDrivingView()) {
      const val = timeline.resolveValueAtPath(
        'camera3D.radius',
        timeline.currentFrame(),
      )
      if (val !== null && typeof val === 'number') return val
    }
    return flameDescriptor.renderSettings.camera3D.radius
  }

  const effectiveTarget3D = () => {
    return new Float32Array(flameDescriptor.renderSettings.camera3D.target)
  }

  const effectiveRoll = () => {
    if (timeline.isDrivingView()) {
      const val = timeline.resolveValueAtPath(
        'camera3D.roll',
        timeline.currentFrame(),
      )
      if (val !== null && typeof val === 'number') return val
    }
    return flameDescriptor.renderSettings.camera3D.roll
  }

  const effectiveFov = () => {
    if (timeline.isDrivingView()) {
      const val = timeline.resolveValueAtPath(
        'camera3D.fov',
        timeline.currentFrame(),
      )
      if (val !== null && typeof val === 'number') return val
    }
    return flameDescriptor.renderSettings.camera3D.fov
  }

  return {
    setFlameZoom,
    setFlamePosition,
    setFlameTheta,
    setFlamePhi,
    setFlameRadius,
    setFlameTarget3D,
    setFlameFov,
    setFlameRoll,
    flyMode,
    setFlyMode,
    flySpeed,
    effectiveTheta,
    effectivePhi,
    effectiveRadius,
    effectiveTarget3D,
    effectiveRoll,
    effectiveFov,
  }
}
