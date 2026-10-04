/**
 * Byte layouts shared by the reference-orbit worker, the GPU buffers and the
 * CPU mirror of the kernel.
 *
 * A reference entry is 16 bytes: an f32 mantissa pair, an i32 exponent and
 * padding, mirroring the WGSL `OrbitEntry` struct. The mantissa's larger part
 * is in [0.5, 1); an exact zero carries `ZERO_EXPONENT`, which every
 * comparison in the kernel treats as "smaller than anything".
 */
import { exponentOf, scalePow2, ZERO_EXPONENT } from './floatExp'
import type { ReferenceOrbit } from './referenceOrbit'

export const ORBIT_ENTRY_BYTES = 16
export const ORBIT_ENTRY_WORDS = ORBIT_ENTRY_BYTES / 4

export function packOrbit(orbit: ReferenceOrbit): ArrayBuffer {
  const data = new ArrayBuffer(Math.max(1, orbit.length) * ORBIT_ENTRY_BYTES)
  const f32 = new Float32Array(data)
  const i32 = new Int32Array(data)
  for (let n = 0; n < orbit.length; n += 1) {
    const re = orbit.z[2 * n]!
    const im = orbit.z[2 * n + 1]!
    const w = n * ORBIT_ENTRY_WORDS
    const big = Math.max(Math.abs(re), Math.abs(im))
    if (big === 0) {
      f32[w] = 0
      f32[w + 1] = 0
      i32[w + 2] = ZERO_EXPONENT
      continue
    }
    const k = exponentOf(big)
    f32[w] = scalePow2(re, -k)
    f32[w + 1] = scalePow2(im, -k)
    i32[w + 2] = orbit.zExp[n]! + k
  }
  return data
}

export interface OrbitEntry {
  re: number
  im: number
  e: number
}

export function readOrbitEntry(data: ArrayBuffer, index: number): OrbitEntry {
  const w = index * ORBIT_ENTRY_WORDS
  return {
    re: new Float32Array(data, w * 4, 2)[0]!,
    im: new Float32Array(data, w * 4, 2)[1]!,
    e: new Int32Array(data, w * 4 + 8, 1)[0]!,
  }
}
