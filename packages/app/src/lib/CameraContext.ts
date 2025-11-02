import { createContext } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'
import type { Accessor } from 'solid-js'
import type { TgpuBindGroup, TgpuBindGroupLayout, TgpuFn } from 'typegpu'
import type { F32, v2f, Vec2f } from 'typegpu/data'

export type CameraContext = {
  update: () => void
  bindGroup: TgpuBindGroup
  BindGroupLayout: TgpuBindGroupLayout
  wgsl: {
    worldToClip: TgpuFn<(pos: Vec2f) => Vec2f>
    clipToWorld: TgpuFn<(pos: Vec2f) => Vec2f>
    clipToPixels: TgpuFn<(pos: Vec2f) => Vec2f>
    resolution: TgpuFn<() => Vec2f>
    pixelRatio: TgpuFn<() => F32>
  }
  js: {
    worldToClip: (clip: v2f) => v2f
    clipToWorld: (clip: v2f) => v2f
  }
  zoom: Accessor<number>
}
const CameraContext = createContext<CameraContext>()

export const CameraContextProvider = CameraContext.Provider

export function useCamera() {
  return useContextSafe(CameraContext, 'useCamera', 'CameraContext')
}
