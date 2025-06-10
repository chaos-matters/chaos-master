import { atomic, i32, struct, u32, vec2f } from 'typegpu/data'

export const Point = struct({
  position: vec2f,
  /** OkLab a and b */
  color: vec2f,
})

export const BUCKET_FIXED_POINT_MULTIPLIER = 1000
export const BUCKET_FIXED_POINT_MULTIPLIER_INV =
  1 / BUCKET_FIXED_POINT_MULTIPLIER

export const Bucket = struct({
  /** Fixed point multiplier 1000 */
  count: u32,
  /** Fixed point OkLab a and b multiplier 1000 */
  color: struct({
    a: i32,
    b: i32,
  }),
})

/** Same as Bucket but atomicAdd works on its fields */
export const AtomicBucket = struct({
  count: atomic(u32),
  color: struct({
    a: atomic(i32),
    b: atomic(i32),
  }),
})
