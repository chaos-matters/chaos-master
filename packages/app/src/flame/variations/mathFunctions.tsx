import { tgpu } from 'typegpu'
import { f32, vec2f } from 'typegpu/data'
import { sqrt } from 'typegpu/std'

const quadraticFuncFn = tgpu.fn([f32, f32, f32], vec2f)

export const quadraticFuncImpl = quadraticFuncFn((a, b, c) => {
  'use gpu'
  const discriminant = b * b - 4.0 * a * c
  if (discriminant < 0.0) {
    // TODO: Define this with a struct or when spec introduces something like FP::MAX;FP::MIN
    // indicate invalid result with two negative
    return vec2f(-1000.0, -1000.0)
  }
  const sqrtD = sqrt(discriminant)
  const x1 = (-b + sqrtD) / (2.0 * a)
  const x2 = (-b - sqrtD) / (2.0 * a)
  return vec2f(x1, x2)
})
