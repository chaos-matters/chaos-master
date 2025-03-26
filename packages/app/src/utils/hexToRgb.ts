import { vec3f } from 'typegpu/data'

export function hexToRgbNorm(hex: string) {
  const bigint = parseInt(hex.replaceAll('#', ''), 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return vec3f(r / 255, g / 255, b / 255)
}
