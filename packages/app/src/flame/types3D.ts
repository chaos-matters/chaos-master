import { struct, vec2f, vec3f } from 'typegpu/data'
import { BUCKET_FIXED_POINT_MULTIPLIER } from './types'

export { BUCKET_FIXED_POINT_MULTIPLIER }

export const Point3D = struct({
  position: vec3f,
  /** OkLab a and b */
  color: vec2f,
}).$name('Point3D')
