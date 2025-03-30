import { vec2f } from 'typegpu/data'
import { vec2 } from 'wgpu-matrix'
import type { v2f } from 'typegpu/data'

export function maxLength2(v: v2f, maxLength: number) {
  const length = vec2.length(v)
  if (length > maxLength) {
    return vec2.setLength(v, maxLength, vec2f())
  }
  return v
}
