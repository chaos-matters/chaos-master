import { atomic, f32, i32, struct, u32, vec2f } from 'typegpu/data'

export const Point = struct({
  position: vec2f,
  /** OkLab a and b */
  color: vec2f,
})

export const BUCKET_FIXED_POINT_MULTIPLIER = 1000
export const BUCKET_FIXED_POINT_MULTIPLIER_INV =
  1 / BUCKET_FIXED_POINT_MULTIPLIER

// Per-bucket saturation cap for the accumulation atomics. Once a bucket's
// fixed-point count reaches this, accumulation into it stops, so the u32 count
// and the i32 color/z accumulators can never wrap around (a hot spot wrapping
// shows up as a dark/garbage pixel). 2^29 fixed units ≈ 5.4e5 actual points in
// a single pixel — far past visual convergence — and leaves headroom for the
// i32 color/z sums (|color|·count, |z|·count) to stay within range even with
// concurrent over-add. Cold buckets keep refining; only runaway hot spots clamp.
export const BUCKET_SATURATION_COUNT = 1 << 29

export const Bucket = struct({
  /** Fixed point multiplier 1000 */
  count: u32,
  /** Fixed point multiplier 1000 */
  z: i32,
  /** Fixed point OkLab a and b multiplier 1000 */
  color: struct({
    a: i32,
    b: i32,
  }),
})

/** Same as Bucket but atomicAdd works on its fields */
export const AtomicBucket = struct({
  count: atomic(u32),
  z: atomic(i32),
  color: struct({
    a: atomic(i32),
    b: atomic(i32),
  }),
})

export const FilterParams = struct({
  sigma: f32,
})
