import { random } from '@/shaders/random'
import { f32, struct } from 'typegpu/data'
import { PI } from '../../constants'
import { parametricVariation } from '../types'

export const PieParams = struct({
  slices: f32,
  rotation: f32,
  thickness: f32,
})
export const pie = parametricVariation(
  PieParams,
  /* wgsl */ `(_pos: vec2f, P: PieParams) -> vec2f {
    let p1 = P.slices;
    let p2 = P.rotation;
    let p3 = P.thickness;
    let r1 = random();
    let r2 = random();
    let r3 = random();
    let t1 = trunc(r1 * p1 + 0.5);
    let t2 = p2 + (t1 + r2 * p3) * 2 * PI / p1;
    return r3 * vec2f(cos(t2), sin(t2));
  }`,
  { random, PI },
)
