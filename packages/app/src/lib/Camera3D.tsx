import { createMemo } from 'solid-js'
import { tgpu } from 'typegpu'
import { f32, mat4x4f, struct, vec2f, vec3f, vec4f } from 'typegpu/data'
import { mul } from 'typegpu/std'
import { mat4, vec3 } from 'wgpu-matrix'
import { Camera3DContextProvider } from './Camera3DContext'
import { useCanvas } from './CanvasContext'
import { useRootContext } from './RootContext'
import type { ParentProps } from 'solid-js'
import type { Vec3 } from 'wgpu-matrix'

export const Camera3DUniforms = struct({
  viewProjectionMatrix: mat4x4f,
  resolution: vec2f,
  pixelRatio: f32,
  focusDistance: f32,
}).$name('Camera3DUniforms')

export const Camera3DBindGroupLayout = tgpu
  .bindGroupLayout({
    camera3DUniforms: { uniform: Camera3DUniforms },
  })
  .$name('Camera3DBindGroupLayout')

export const camera3DWorldToClip = tgpu.fn(
  [vec3f],
  vec3f,
)((world) => {
  const camera3DUniforms = Camera3DBindGroupLayout.$.camera3DUniforms
  const clip4 = mul(camera3DUniforms.viewProjectionMatrix, vec4f(world, 1))
  if (clip4.w <= 0) {
    // Behind the camera — the perspective divide would mirror the point back
    // into view. Push it far outside clip space so the screen-bounds cull
    // discards it.
    return vec3f(1e10, 1e10, 1e10)
  }
  // We return clip4.w - focusDistance as the z component.
  // This means z=0 is at the target plane.
  return vec3f(
    clip4.x / clip4.w,
    clip4.y / clip4.w,
    clip4.w - camera3DUniforms.focusDistance,
  )
})

type Camera3DProps = {
  position: Vec3
  target: Vec3
  fov: number
}

import type { Camera3DObj } from '@/flame/schema/flameSchema'

/** Static camera for 3D flame thumbnails/previews. Reads from descriptor if
 *  provided. Prop values are computed in accessors instead of inline ternaries
 *  — Solid wraps conditional JSX prop expressions in lazily-created memos,
 *  which leak ("created outside createRoot") when first read from a
 *  non-reactive context such as the render loop's rAF callback. */
export function Default3DPreviewCamera(
  props: ParentProps<{ camera3D?: Camera3DObj }>,
) {
  const position = () => {
    const c = props.camera3D
    if (!c) return new Float32Array([0, 0, 5])
    return new Float32Array([
      c.target[0] + c.radius * Math.sin(c.phi) * Math.sin(c.theta),
      c.target[1] + c.radius * Math.cos(c.phi),
      c.target[2] + c.radius * Math.sin(c.phi) * Math.cos(c.theta),
    ])
  }
  const target = () => {
    const c = props.camera3D
    return new Float32Array(c ? c.target : [0, 0, 0])
  }
  const fov = () => props.camera3D?.fov ?? 60
  return (
    <Camera3D position={position()} target={target()} fov={fov()}>
      {props.children}
    </Camera3D>
  )
}

export function Camera3D(props: ParentProps<Camera3DProps>) {
  const { root } = useRootContext()
  const { canvasSize, pixelRatio } = useCanvas()

  const uniformsBuffer = root
    .createBuffer(Camera3DUniforms)
    .$usage('uniform')
    .$name('Camera3DUniforms')

  const uniformBindGroup = root.createBindGroup(Camera3DBindGroupLayout, {
    camera3DUniforms: uniformsBuffer,
  })

  const uniforms = createMemo(() => {
    const size = canvasSize()
    const { width, height } = size
    const { position, target, fov } = props
    const aspect = width / height

    const up = vec3.fromValues(0, 1, 0)
    const viewMatrix = mat4.lookAt(position, target, up)
    const projectionMatrix = mat4.perspective(
      fov * (Math.PI / 180),
      aspect,
      0.01,
      100,
    )
    const viewProjectionMatrix = mat4.mul(
      projectionMatrix,
      viewMatrix,
      mat4x4f(),
    )

    return {
      viewProjectionMatrix,
      resolution: vec2f(width, height),
      pixelRatio: pixelRatio() * window.devicePixelRatio,
      focusDistance: vec3.distance(position, target),
    }
  })

  function worldToClip(pos: Vec3): Vec3 {
    const m = uniforms().viewProjectionMatrix
    const x = pos[0]! * m[0]! + pos[1]! * m[4]! + pos[2]! * m[8]! + m[12]!
    const y = pos[0]! * m[1]! + pos[1]! * m[5]! + pos[2]! * m[9]! + m[13]!
    const w = pos[0]! * m[3]! + pos[1]! * m[7]! + pos[2]! * m[11]! + m[15]!
    return vec3.fromValues(x / w, y / w, 0)
  }

  function update() {
    uniformsBuffer.write(uniforms())
  }

  return (
    <Camera3DContextProvider
      value={{
        update,
        bindGroup: uniformBindGroup,
        BindGroupLayout: Camera3DBindGroupLayout,
        wgsl: {
          worldToClip: camera3DWorldToClip,
        },
        js: {
          worldToClip,
        },
        fov: () => props.fov,
        position: () => props.position,
        target: () => props.target,
      }}
    >
      {props.children}
    </Camera3DContextProvider>
  )
}
