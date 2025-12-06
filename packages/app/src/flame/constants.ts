import { tgpu } from 'typegpu'
import { f32 } from 'typegpu/data'

export const PI = tgpu.const(f32, Math.PI)
export const EPS = tgpu.const(f32, 0.000001)
