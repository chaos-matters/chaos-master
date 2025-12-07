import { tgpu } from 'typegpu'
import { f32 } from 'typegpu/data'

export const EPS = tgpu.const(f32, 0.000001)
export const EPS_TINY = tgpu.const(f32, 0.0000000001)
export const PI = tgpu.const(f32, Math.PI)
