import { createContext } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'
import type { Accessor } from 'solid-js'
import type { TgpuBindGroup, TgpuBindGroupLayout, TgpuFn } from 'typegpu'
import type { Vec2f, Vec3f } from 'typegpu/data'
import type { Vec3 } from 'wgpu-matrix'

export type Camera3DContext = {
  update: () => void
  bindGroup: TgpuBindGroup
  BindGroupLayout: TgpuBindGroupLayout
  wgsl: {
    worldToClip: TgpuFn<(pos: Vec3f) => Vec3f>
  }
  js: {
    worldToClip: (pos: Vec3) => Vec3
  }
  fov: Accessor<number>
  position: Accessor<Vec3>
  target: Accessor<Vec3>
}
const Camera3DContextExport = createContext<Camera3DContext>()

export const Camera3DContext = Camera3DContextExport
export const Camera3DContextProvider = Camera3DContextExport.Provider

export function useCamera3D() {
  return useContextSafe(Camera3DContextExport, 'useCamera3D', 'Camera3DContext')
}
