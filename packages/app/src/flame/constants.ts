import { tgpu } from 'typegpu'
import { f32 } from 'typegpu/data'

// Epsilon guard ladder, coarse → fine. These cap divide-by-zero / domain
// blow-ups in the GPU variation shaders: without them a 0 denominator or a
// slightly-out-of-domain sqrt/acos produces inf/NaN, which then propagates
// through the persisted chaos-game chain and leaves visible dead/speckled
// regions. Pick the tier by how small the guarded quantity legitimately gets:
//   - EPS       (1e-6):  divisors that are normally O(1) (e.g. a parameter).
//   - EPS_SMALL (1e-9):  denominators that can get small but rarely hit 0.
//   - EPS_TINY  (1e-10): sum-of-squares / radii that genuinely reach ~0 at the
//                        origin, where a larger epsilon would dim the center.
export const EPS = tgpu.const(f32, 0.000001)
export const EPS_SMALL = tgpu.const(f32, 0.000000001)
export const EPS_TINY = tgpu.const(f32, 0.0000000001)
export const PI = tgpu.const(f32, Math.PI)
