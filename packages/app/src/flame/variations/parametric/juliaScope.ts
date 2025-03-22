import { f32, struct } from 'typegpu/data'
import { parametricVariation } from '../types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'

export const JuliaScopeParams = struct({
  power: f32,
  dist: f32,
})
export const juliaScope = parametricVariation(
  JuliaScopeParams,
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo, P: JuliaScopeParams) -> vec2f {
    let p1 = P.power; 
    let p2 = P.dist; 
    let p3 = trunc(abs(p1) * random()); 
    let r = length(pos);
    let phi = atan2(pos.y, pos.x);
    let lambda = select(-1.0, 1.0, random() > 0.5);
    let t = (lambda * phi + 2 * PI * p3) / p1;
    let factor = pow(r, p2 / p1);
    return factor * vec2f(cos(t), sin(t));
  }`,
  { PI, random },
)
