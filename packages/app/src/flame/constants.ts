import { tgpu } from 'typegpu'
import { f32 } from 'typegpu/data'

export const PI = tgpu['~unstable'].const(f32, Math.PI)
