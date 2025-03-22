import { f32, struct } from 'typegpu/data'
import { parametricVariation } from '../types'

export const RingsParams = struct({
  val: f32,
})
export const rings2 = parametricVariation(
  RingsParams,
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo, P: RingsParams) -> vec2f {
    let p = P.val; 
    let r = length(pos); 
    let theta = atan2(pos.y, pos.x);
    let twop = 2 * p;
    let t = r - twop * trunc((r + p) / twop) + r * (1 - p);
    return t * vec2f(sin(theta), cos(theta));
  }`,
)
