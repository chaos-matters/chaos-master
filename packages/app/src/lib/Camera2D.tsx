import { createMemo } from 'solid-js'
import { tgpu } from 'typegpu'
import { f32, mat3x3f, struct, vec2f, vec3f } from 'typegpu/data'
import { div, mul } from 'typegpu/std'
import { mat3 } from 'wgpu-matrix'
import { camera2DViewMatrix } from './camera2DView'
import { CameraContextProvider } from './CameraContext'
import { useCanvas } from './CanvasContext'
import { NO_SHIFT } from './canvasFraming'
import { useLiveRootContext } from './RootContext'
import type { ParentProps } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { ViewShift } from './canvasFraming'

export const Camera2DUniforms = struct({
  viewMatrix: mat3x3f,
  viewMatrixInverse: mat3x3f,
  resolution: vec2f,
  pixelRatio: f32,
}).$name('Camera2DUniforms')

export const Camera2DBindGroupLayout = tgpu
  .bindGroupLayout({
    camera2DUniforms: { uniform: Camera2DUniforms },
  })
  .$name('Camera2DBindGroupLayout')

export const camera2DWorldToClip = tgpu.fn(
  [vec2f],
  vec2f,
)((world) => {
  const camera2DUniforms = Camera2DBindGroupLayout.$.camera2DUniforms
  const clip = mul(camera2DUniforms.viewMatrix, vec3f(world, 1))
  return div(clip.xy, clip.z)
})

export const camera2DClipToWorld = tgpu.fn(
  [vec2f],
  vec2f,
)((clip) => {
  const camera2DUniforms = Camera2DBindGroupLayout.$.camera2DUniforms
  const world = mul(camera2DUniforms.viewMatrixInverse, vec3f(clip, 1))
  return div(world.xy, world.z)
})

export const camera2DClipToPixels = tgpu.fn(
  [vec2f],
  vec2f,
)((clip) => {
  const camera2DUniforms = Camera2DBindGroupLayout.$.camera2DUniforms
  return mul(mul(0.5, clip), camera2DUniforms.resolution)
})

export const camera2DResolution = tgpu.fn(
  [],
  vec2f,
)(() => {
  const camera2DUniforms = Camera2DBindGroupLayout.$.camera2DUniforms
  return camera2DUniforms.resolution
})

export const camera2DPixelRatio = tgpu.fn(
  [],
  f32,
)(() => {
  const camera2DUniforms = Camera2DBindGroupLayout.$.camera2DUniforms
  return camera2DUniforms.pixelRatio
})

type Camera2DProps = {
  position: v2f
  zoom: number
  /**
   * Radians. Required, and deliberately not defaulted: rotation reaches the
   * renderer through this prop and nowhere else, so a mount that omits it
   * renders the flame un-turned while an export of the same flame turns. A
   * view of its own — a thumbnail framed by the component, an editor's grid —
   * passes a literal 0 and says so; a mount that frames a flame with the
   * flame's own camera passes `camera.rotation ?? 0`.
   */
  rotation: number
  /**
   * Where the camera centre lands on the canvas, in clip units; the middle
   * without one. Only the editor canvas passes it, to frame the flame beside
   * the tablet deck floating over it (lib/canvasFraming.ts). It is the
   * view's, never the flame's: nothing here writes it back.
   */
  viewShift?: ViewShift
}

export function Camera2D(props: ParentProps<Camera2DProps>) {
  const { root } = useLiveRootContext()
  const { canvasSize, pixelRatio } = useCanvas()

  const uniformsBuffer = root
    .createBuffer(Camera2DUniforms)
    .$usage('uniform')
    .$name('Camera2DUniforms')

  const uniformBindGroup = root.createBindGroup(Camera2DBindGroupLayout, {
    camera2DUniforms: uniformsBuffer,
  })

  const uniforms = createMemo(() => {
    const size = canvasSize()
    const { width, height } = size
    const { position, zoom, rotation: rawRotation } = props
    const rawX = position?.x
    const rawY = position?.y
    const x = Number.isFinite(rawX) ? rawX : 0
    const y = Number.isFinite(rawY) ? rawY : 0
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
    const aspect = height > 0 ? width / height : 1
    const rotation = Number.isFinite(rawRotation) ? rawRotation : 0
    const viewMatrix = camera2DViewMatrix({
      x,
      y,
      zoom: safeZoom,
      rotation,
      aspect,
      shift: props.viewShift ?? NO_SHIFT,
    })
    const viewMatrixInverse = mat3.inverse(viewMatrix, mat3x3f())
    return {
      viewMatrix,
      viewMatrixInverse,
      resolution: vec2f(width, height),
      pixelRatio: pixelRatio() * window.devicePixelRatio,
    }
  })

  function worldToClip({ x, y }: v2f) {
    return mul(uniforms().viewMatrix, vec3f(x, y, 1)).xy
  }

  function clipToWorld({ x, y }: v2f) {
    return mul(uniforms().viewMatrixInverse, vec3f(x, y, 1)).xy
  }

  function update() {
    uniformsBuffer.write(uniforms())
  }

  return (
    <CameraContextProvider
      value={{
        update,
        bindGroup: uniformBindGroup,
        BindGroupLayout: Camera2DBindGroupLayout,
        wgsl: {
          worldToClip: camera2DWorldToClip,
          clipToWorld: camera2DClipToWorld,
          clipToPixels: camera2DClipToPixels,
          resolution: camera2DResolution,
          pixelRatio: camera2DPixelRatio,
        },
        js: {
          worldToClip,
          clipToWorld,
        },
        zoom: () =>
          Number.isFinite(props.zoom) && props.zoom > 0 ? props.zoom : 1,
        position: () => props.position,
        setPosition: (pos: v2f | ((prev: v2f) => v2f)) => {
          if (typeof pos === 'function') {
            props.position = pos(props.position)
          } else {
            props.position = pos
          }
          return props.position
        },
      }}
    >
      {props.children}
    </CameraContextProvider>
  )
}
