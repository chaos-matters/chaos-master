import { projectFlameToSchema } from '@chaos-master/core'
import { allTransformVariations, isAnyParametricVariationType, } from '@/flame/variations'
import { resolveKeyframeValue } from '@/utils/timeline'
import type { PointInitMode } from '@/flame/pointInitMode'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineTrack } from '@/utils/timeline'

export interface TimelineAccess {
  isDrivingView: () => boolean
  hasKeyframeAtFrame: (path: string, frame: number) => boolean
  currentFrame: () => number
  tracks: () => TimelineTrack[]
  setValueResolver: (resolver: FlameValueResolver) => void
  setValueWriter: (writer: FlameValueWriter) => void
}

export type FlameValue =
  | number
  | string
  | [number, number, number]
  | [number, number, number, number]
  | null

export type FlameValueResolver = (path: string) => FlameValue
export type FlameValueWriter = (path: string, value: FlameValue) => void

export interface UseWorkspaceTimelineBindingParams {
  flameDescriptor: FlameDescriptor
  history: {
    setSilently: (updater: (draft: FlameDescriptor) => void) => void
  }
  timeline: TimelineAccess
  blendWeight: () => number
}

function getTimelineCameraKeyframeValue(
  timeline: TimelineAccess,
  path: string,
): number | null {
  if (!timeline.isDrivingView()) return null
  if (!timeline.hasKeyframeAtFrame(path, timeline.currentFrame())) return null
  const track = timeline.tracks().find((t) => t.parameterPath === path)
  if (!track) return null
  const val = resolveKeyframeValue(track.keyframes, timeline.currentFrame())
  return typeof val === 'number' ? val : null
}

const RENDER_GETTERS: Record<
  string,
  (rs: FlameDescriptor['renderSettings']) => FlameValue
> = {
  exposure: (rs) => rs.exposure,
  skipIters: (rs) => rs.skipIters,
  plotsPerChain: (rs) => rs.plotsPerChain,
  vibrancy: (rs) => rs.vibrancy,
  contrast: (rs) => rs.contrast ?? 1,
  gamma: (rs) => rs.gamma ?? 2.2,
  highlightPower: (rs) => rs.highlightPower ?? 1,
  drawMode: (rs) => rs.drawMode,
  colorInitMode: (rs) => rs.colorInitMode,
  pointInitMode: (rs) => rs.pointInitMode,
  densityEstimationQuality: (rs) => rs.densityEstimationQuality ?? 0.8,
  estimatorCurve: (rs) => rs.estimatorCurve ?? 0.5,
  paletteMode: (rs) => rs.paletteMode ?? 0,
  palettePhase: (rs) => rs.palettePhase ?? 0,
  paletteSpeed: (rs) => rs.paletteSpeed ?? 1,
  backgroundColor: (rs) => rs.backgroundColor ?? [0, 0, 0],
  edgeFadeColor: (rs) => rs.edgeFadeColor ?? [0, 0, 0, 0],
}

const CAMERA_GETTERS: Record<
  string,
  (rs: FlameDescriptor['renderSettings']) => FlameValue
> = {
  'camera.x': (rs) => rs.camera?.position[0] ?? 0,
  'camera.y': (rs) => rs.camera?.position[1] ?? 0,
  'camera.zoom': (rs) => rs.camera?.zoom ?? 1,
  'camera.rotation': (rs) =>
    ((rs.camera as Record<string, unknown> | undefined)?.rotation as
      | number
      | undefined) ?? 0,
  'camera3D.theta': (rs) => rs.camera3D?.theta ?? 0,
  'camera3D.phi': (rs) => rs.camera3D?.phi ?? Math.PI / 2,
  'camera3D.radius': (rs) => rs.camera3D?.radius ?? 5,
  'camera3D.fov': (rs) => rs.camera3D?.fov ?? 60,
}

/**
 * The keyframe short-circuit belongs to camera paths only. Before this hook was
 * extracted from MainWorkspace it was written out longhand in exactly these
 * seven cases, and `camera.rotation` deliberately had none. Applying it to every
 * path makes a slider on a keyframed transform snap back, because
 * addKeyframeImpl writes the resolved value straight back into the flame.
 */
const KEYFRAME_SHORT_CIRCUIT_PATHS: ReadonlySet<string> = new Set([
  'camera.x',
  'camera.y',
  'camera.zoom',
  'camera3D.theta',
  'camera3D.phi',
  'camera3D.radius',
  'camera3D.fov',
])

function getFlameCameraSetting(
  rs: FlameDescriptor['renderSettings'],
  path: string,
  timeline: TimelineAccess,
): FlameValue | undefined {
  const getter = CAMERA_GETTERS[path]
  if (!getter) return undefined
  if (KEYFRAME_SHORT_CIRCUIT_PATHS.has(path)) {
    const kf = getTimelineCameraKeyframeValue(timeline, path)
    if (kf !== null) return kf
  }
  return getter(rs)
}

function getFlameTransformSetting(
  transforms: Record<string, unknown>,
  parts: string[],
): FlameValue | undefined {
  if (parts[0] !== 'transform') return undefined
  const transform = transforms[parts[1]!] as
    | {
        probability?: number
        colorSpeed?: number
        color?: Record<string, number>
        preAffine?: Record<string, number>
        postAffine?: Record<string, number>
        variations?: Record<string, { weight?: number }>
      }
    | undefined

  if (!transform) return null
  if (parts.length === 3 && parts[2] === 'probability') {
    return transform.probability ?? null
  }
  if (parts.length === 3 && parts[2] === 'colorSpeed') {
    return transform.colorSpeed ?? 0.4
  }
  if (
    parts.length === 4 &&
    (parts[2] === 'preAffine' || parts[2] === 'postAffine')
  ) {
    const affine = transform[parts[2]]
    if (affine && parts[3]! in affine) {
      return affine[parts[3]!]
    }
  }
  if (parts.length === 4 && parts[2] === 'color') {
    const color = transform.color
    if (color && parts[3]! in color) {
      return color[parts[3]!] ?? null
    }
  }
  return null
}

function getFlameVariationSetting(
  transforms: Record<string, unknown>,
  parts: string[],
): FlameValue {
  if (parts.length === 3) {
    const [transformId, variationId, paramName] = parts as [
      string,
      string,
      string,
    ]
    const transform = transforms[transformId] as
      | {
          variations?: Record<
            string,
            { type: string; params?: Record<string, number> }
          >
        }
      | undefined
    const variation = transform?.variations?.[variationId]
    if (variation) {
      if (variation.params && variation.params[paramName] !== undefined) {
        return variation.params[paramName]
      }
      if (isAnyParametricVariationType(variation.type)) {
        const vDef = (allTransformVariations as Record<string, unknown>)[
          variation.type
        ] as { paramDefaults: Record<string, number> } | undefined
        if (vDef && paramName in vDef.paramDefaults) {
          const d = vDef.paramDefaults[paramName]
          if (d !== undefined) return d
        }
      }
    }
  }

  if (parts.length === 2 && parts[0] !== 'transform' && parts[0] !== 'camera') {
    const [transformId, variationId] = parts as [string, string]
    const transform = transforms[transformId] as
      | { variations?: Record<string, { weight?: number }> }
      | undefined
    const variation = transform?.variations?.[variationId]
    if (variation?.weight !== undefined) return variation.weight
  }

  return null
}

const RENDER_SETTERS: Record<
  string,
  (rs: FlameDescriptor['renderSettings'], value: FlameValue) => void
> = {
  blendWeight: (rs, val) => {
    rs.blendWeight = val as number
  },
  exposure: (rs, val) => {
    rs.exposure = val as number
  },
  skipIters: (rs, val) => {
    rs.skipIters = val as number
  },
  plotsPerChain: (rs, val) => {
    rs.plotsPerChain = val as number
  },
  vibrancy: (rs, val) => {
    rs.vibrancy = val as number
  },
  contrast: (rs, val) => {
    rs.contrast = val as number
  },
  gamma: (rs, val) => {
    rs.gamma = val as number
  },
  highlightPower: (rs, val) => {
    rs.highlightPower = val as number
  },
  drawMode: (rs, val) => {
    rs.drawMode = val as 'light' | 'paint'
  },
  colorInitMode: (rs, val) => {
    rs.colorInitMode = val as 'colorInitZero' | 'colorInitPosition'
  },
  pointInitMode: (rs, val) => {
    rs.pointInitMode = val as PointInitMode
  },
  densityEstimationQuality: (rs, val) => {
    rs.densityEstimationQuality = val as number
  },
  estimatorCurve: (rs, val) => {
    rs.estimatorCurve = val as number
  },
  paletteMode: (rs, val) => {
    rs.paletteMode = val as number
  },
  palettePhase: (rs, val) => {
    rs.palettePhase = val as number
  },
  paletteSpeed: (rs, val) => {
    rs.paletteSpeed = val as number
  },
  backgroundColor: (rs, val) => {
    if (Array.isArray(val)) {
      rs.backgroundColor = val as [number, number, number]
    }
  },
  edgeFadeColor: (rs, val) => {
    if (Array.isArray(val)) {
      rs.edgeFadeColor = val as [number, number, number, number]
    }
  },
}

const CAMERA_SETTERS: Record<
  string,
  (rs: FlameDescriptor['renderSettings'], value: FlameValue) => void
> = {
  'camera.x': (rs, val) => {
    if (rs.camera) rs.camera.position[0] = val as number
  },
  'camera.y': (rs, val) => {
    if (rs.camera) rs.camera.position[1] = val as number
  },
  'camera.zoom': (rs, val) => {
    if (rs.camera) rs.camera.zoom = val as number
  },
  'camera.rotation': (rs, val) => {
    if (rs.camera) {
      ;(rs.camera as Record<string, unknown>).rotation = val
    }
  },
  'camera3D.theta': (rs, val) => {
    if (rs.camera3D) rs.camera3D.theta = val as number
  },
  'camera3D.phi': (rs, val) => {
    if (rs.camera3D) rs.camera3D.phi = val as number
  },
  'camera3D.radius': (rs, val) => {
    if (rs.camera3D) rs.camera3D.radius = val as number
  },
  'camera3D.fov': (rs, val) => {
    if (rs.camera3D) rs.camera3D.fov = val as number
  },
}

function setFlameCameraSetting(
  rs: FlameDescriptor['renderSettings'],
  path: string,
  value: FlameValue,
): boolean {
  const setter = CAMERA_SETTERS[path]
  if (setter) {
    setter(rs, value)
    return true
  }
  return false
}

function setFlameTransformSetting(
  transforms: Record<string, unknown>,
  parts: string[],
  value: FlameValue,
): boolean {
  if (parts[0] !== 'transform') return false
  const transform = transforms[parts[1]!] as
    | {
        probability?: number
        colorSpeed?: number
        color?: Record<string, number>
        preAffine?: Record<string, number>
        postAffine?: Record<string, number>
        variations?: Record<string, { weight?: number }>
      }
    | undefined
  if (!transform) return true

  if (parts.length === 3 && parts[2] === 'probability') {
    transform.probability = value as number
  } else if (parts.length === 3 && parts[2] === 'colorSpeed') {
    transform.colorSpeed = value as number
  } else if (
    parts.length === 4 &&
    (parts[2] === 'preAffine' || parts[2] === 'postAffine')
  ) {
    const affine = transform[parts[2]]
    if (affine && parts[3]! in affine) {
      affine[parts[3]!] = value as number
    }
  } else if (parts.length === 4 && parts[2] === 'color') {
    const color = transform.color
    if (color && parts[3]! in color) {
      color[parts[3]!] = value as number
    }
  }
  return true
}

function setFlameVariationSetting(
  transforms: Record<string, unknown>,
  parts: string[],
  value: FlameValue,
) {
  if (parts.length === 3) {
    const [transformId, variationId, paramName] = parts as [
      string,
      string,
      string,
    ]
    const transform = transforms[transformId] as
      | {
          variations?: Record<
            string,
            { type: string; params?: Record<string, number> }
          >
        }
      | undefined
    const variation = transform?.variations?.[variationId]
    if (variation?.params) {
      variation.params[paramName] = value as number
    }
  } else if (parts.length === 2 && parts[0] !== 'camera') {
    const [transformId, variationId] = parts as [string, string]
    const transform = transforms[transformId] as
      | { variations?: Record<string, { weight?: number }> }
      | undefined
    const variation = transform?.variations?.[variationId]
    if (variation) {
      variation.weight = value as number
    }
  }
}

function writeFlameValue(
  draft: FlameDescriptor,
  path: string,
  value: FlameValue,
): void {
  const renderSetter = RENDER_SETTERS[path]
  if (renderSetter) {
    renderSetter(draft.renderSettings, value)
    return
  }

  if (setFlameCameraSetting(draft.renderSettings, path, value)) return

  const parts = path.split('.')
  if (setFlameTransformSetting(draft.transforms, parts, value)) return

  setFlameVariationSetting(draft.transforms, parts, value)
}

export function useWorkspaceTimelineBinding(
  params: UseWorkspaceTimelineBindingParams,
) {
  const { flameDescriptor, history, timeline, blendWeight } = params

  function getFlameValue(path: string): FlameValue {
    const fd = flameDescriptor
    if (path === 'blendWeight') {
      return blendWeight()
    }

    const getter = RENDER_GETTERS[path]
    if (getter) return getter(fd.renderSettings)

    const cameraVal = getFlameCameraSetting(fd.renderSettings, path, timeline)
    if (cameraVal !== undefined) return cameraVal

    const parts = path.split('.')
    const transformVal = getFlameTransformSetting(fd.transforms, parts)
    if (transformVal !== undefined) return transformVal

    return getFlameVariationSetting(fd.transforms, parts)
  }

  function setFlameValue(path: string, value: FlameValue) {
    history.setSilently((draft) => {
      writeFlameValue(draft, path, value)
      // The timeline writes the value it resolved at the playhead, which
      // between two keyframes is an interpolation: skipIters 12.5 would leave
      // a document that no longer shares or saves. Same projection as a frame.
      projectFlameToSchema(draft)
    })
  }

  timeline.setValueResolver(getFlameValue)
  timeline.setValueWriter(setFlameValue)

  return { getFlameValue, setFlameValue }
}
