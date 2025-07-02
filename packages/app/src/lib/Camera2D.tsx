import { createMemo } from 'solid-js'
import { tgpu } from 'typegpu'
import { f32, mat3x3f, mat4x4f, struct, vec2f, vec3f } from 'typegpu/data'
import { mul } from 'typegpu/std'
import { mat3, mat4 } from 'wgpu-matrix'
import { CameraContextProvider } from './CameraContext'
import { useCanvas } from './CanvasContext'
import { useRootContext } from './RootContext'
import type { ParentProps } from 'solid-js'
import type { v2f } from 'typegpu/data'

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

export const camera2DWorldToClip = tgpu['~unstable'].fn(
  [vec2f],
  vec2f,
)/* wgsl */ `
  (world: vec2f) -> vec2f {
    let clip = camera2DUniforms.viewMatrix * vec3(world, 1);
    return clip.xy / clip.z;
  }
`
  .$uses({ ...Camera2DBindGroupLayout.bound })
  .$name('camera2DWorldToClip')

export const camera2DClipToWorld = tgpu['~unstable'].fn(
  [vec2f],
  vec2f,
)/* wgsl */ `
  (clip: vec2f) -> vec2f {
    let world = camera2DUniforms.viewMatrixInverse * vec3(clip, 1);
    return world.xy / world.z;
  }
`
  .$uses({ ...Camera2DBindGroupLayout.bound })
  .$name('camera2DClipToWorld')

export const camera2DClipToPixels = tgpu['~unstable'].fn(
  [vec2f],
  vec2f,
)/* wgsl */ `
  (clip: vec2f) -> vec2f {
    return 0.5 * clip * camera2DUniforms.resolution;
  }
`
  .$uses({ ...Camera2DBindGroupLayout.bound })
  .$name('camera2DClipToPixels')

export const camera2DResolution = tgpu['~unstable'].fn([], vec2f)/* wgsl */ `
  () -> vec2f {
    return camera2DUniforms.resolution;
  }
`
  .$uses({ ...Camera2DBindGroupLayout.bound })
  .$name('camera2DResolution')

export const camera2DPixelRatio = tgpu['~unstable'].fn([], f32)/* wgsl */ `
  () -> f32 {
    return camera2DUniforms.pixelRatio;
  }
`
  .$uses({ ...Camera2DBindGroupLayout.bound })
  .$name('camera2DPixelRatio')

type Camera2DProps = {
  position: v2f
  zoom: number
}

export function Camera2D(props: ParentProps<Camera2DProps>) {
  const { root } = useRootContext()
  const { canvasSize, pixelRatio } = useCanvas()

  const uniformsBuffer = root
    .createBuffer(Camera2DUniforms)
    .$usage('uniform')
    .$name('Camera2DUniforms')

  const uniformBindGroup = root.createBindGroup(Camera2DBindGroupLayout, {
    camera2DUniforms: uniformsBuffer,
  })

  const uniforms = createMemo(() => {
    const { position, zoom } = props
    const { x, y } = position
    const { width, height } = canvasSize()
    const aspect = width / height
    const viewMatrix4 = mat4x4f()
    const fovy = 1 / zoom
    mat4.ortho(
      x - aspect * fovy,
      x + aspect * fovy,
      y - fovy,
      y + fovy,
      0,
      0,
      viewMatrix4,
    )
    // prettier-ignore
    const viewMatrix = mat3x3f(
      viewMatrix4.columns[0].xyw,
      viewMatrix4.columns[1].xyw,
      viewMatrix4.columns[3].xyw,
    )
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
        zoom: () => props.zoom,
      }}
    >
      {props.children}
    </CameraContextProvider>
  )
}
