import { parametricVariation } from '../types'
import { struct, f32 } from 'typegpu/data'

export const PdjParams = struct({
  a: f32,
  b: f32,
  c: f32,
  d: f32,
})
export const pdjVar = parametricVariation(
  PdjParams,
  /* wgsl */ `(pos: vec2f, P: PdjParams) -> vec2f {
    let p1 = P.a;
    let p2 = P.b;
    let p3 = P.c;
    let p4 = P.d;
    return vec2f(
      sin(p1 * pos.y) - cos(p2 * pos.x),
      sin(p3 * pos.x) - cos(p4 * pos.y)
    );
  }`,
)
