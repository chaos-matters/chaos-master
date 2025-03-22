import { f32, struct } from 'typegpu/data'
import { parametricVariation } from '../types'

export const PerspectiveParams = struct({
  angle: f32,
  dist: f32,
})
export const perspective = parametricVariation(
  PerspectiveParams,
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo, P: PerspectiveParams) -> vec2f {
    let p1 = P.angle; 
    let p2 = P.dist; 
    let factor = p2 / (p2 - pos.y * sin(p1));
    return factor * vec2f(pos.x, pos.y * cos(p1));
  }`,
)
