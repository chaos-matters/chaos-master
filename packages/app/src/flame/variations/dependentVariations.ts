import { PI } from '../constants'
import { dependentVariation } from './types'

export const waves = dependentVariation(/* wgsl */ `
  (pos: vec2f, T: AffineParams) -> vec2f {
    let xSinArg = pos.y / (T.c * T.c); 
    let ySinArg = pos.x / (T.f * T.f); 
    return vec2f(
      pos.x + T.b * sin(xSinArg),
      pos.y + T.e * sin(ySinArg),
    );
  }`)

export const popcorn = dependentVariation(/* wgsl */ `
  (pos: vec2f, T: AffineParams) -> vec2f {
    return pos + vec2f(
      T.c * sin(tan(3 * pos.y)),
      T.f * sin(tan(3 * pos.x)),
    );
  }`)

export const rings = dependentVariation(/* wgsl */ `
  (pos: vec2f, T: AffineParams) -> vec2f {
    let c2 = T.c * T.c;
    let r = length(pos); 
    let theta = atan2(pos.y, pos.x);
    let factor = (r + c2) % (2 * c2) - c2 + r * (1 - c2);
    return factor * vec2f(cos(theta), sin(theta));
  }`)

export const fan = dependentVariation(
  /* wgsl */ `
  (pos: vec2f, T: AffineParams) -> vec2f {
    let t = PI * T.c * T.c;
    let r = length(pos); 
    let theta = atan2(pos.y, pos.x);

    let thalf = t / 2;
    let trueAngle = theta - thalf;
    let falseAngle = theta + thalf;
    let modCond = (theta + T.f) % t;
    let angle = select(falseAngle, trueAngle, modCond > thalf);
    return r * vec2f(cos(angle), sin(angle));
  }`,
  { PI },
)
