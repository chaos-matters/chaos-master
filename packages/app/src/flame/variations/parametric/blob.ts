import { parametricVariation } from '../types'
import { struct, f32 } from 'typegpu/data'

export const BlobParams = struct({
  high: f32,
  low: f32,
  waves: f32,
})
export const blob = parametricVariation(
  BlobParams,
  /* wgsl */ `(pos: vec2f, P: BlobParams) -> vec2f {
    let p1 = P.high;
    let p2 = P.low;
    let p3 = P.waves;
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    let sinWavesTheta = sin(p3 * theta);
    let sinFactor = (p1 - p2) / 2;
    let blobFact = r * (p2 + sinFactor * (sinWavesTheta + 1));
    return blobFact * vec2f(cos(theta), sin(theta));
  }`,
)
