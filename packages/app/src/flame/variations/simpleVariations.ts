import { random } from '@/shaders/random'
import { PI } from '../constants'
import { simpleVariation } from './types'

export const linear = simpleVariation(/* wgsl */ `
  (pos: vec2f) -> vec2f {
    return pos;
  }`)

export const randomDisk = simpleVariation(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = sqrt(random());
    let theta = random() * 2 * PI;
    return r * vec2f(cos(theta), sin(theta));
  }`,
  { random, PI },
)

export const gaussian = simpleVariation(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = random() + random() + random() + random() - 2;
    let theta = random() * 2 * PI;
    return r * vec2f(cos(theta), sin(theta));
  }`,
  { random, PI },
)

export const sinusoidal = simpleVariation(/* wgsl */ `
  (pos: vec2f) -> vec2f {
    return vec2f(sin(pos.x), sin(pos.y));
  }`)

export const spherical = simpleVariation(/* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r2 = dot(pos, pos);
    return pos / r2;
  }`)

export const swirl = simpleVariation(/* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r2 = dot(pos, pos);
    let s2 = sin(r2);
    let c2 = cos(r2);
    return vec2f(
      pos.x * s2 - pos.y * c2,
      pos.x * c2 + pos.y * s2,
    );
  }`)

export const horseshoe = simpleVariation(/* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos); 
    return vec2f(
      (pos.x - pos.y) * (pos.x + pos.y),
      2 * pos.x * pos.y
    ) / r;
  }`)

export const polar = simpleVariation(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos); 
    let theta = atan2(pos.y, pos.x);
    return vec2f(theta / PI, r - 1);
  }`,
  { PI },
)

export const handkerchief = simpleVariation(/* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos); 
    let theta = atan2(pos.y, pos.x);
    return r * vec2f(sin(theta + r), cos(theta - r));
  }`)

export const heart = simpleVariation(/* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos); 
    let theta = atan2(pos.y, pos.x);
    return r * vec2f(sin(theta * r), -cos(theta * r));
  }`)

export const disc = simpleVariation(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    let thOverPi = theta / PI;
    return thOverPi * vec2f(sin(PI * r), cos(PI * r));
  }`,
  { PI },
)

export const spiral = simpleVariation(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    let oneOverR = 1 / r;
    return oneOverR * vec2f(
      (cos(theta) + sin(r)),
      (sin(theta) - cos(r))
    );
  }`,
  { PI },
)

export const hyperbolic = simpleVariation(/* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    return vec2f(sin(theta) / r, r * cos(theta));
  }`)

export const diamond = simpleVariation(/* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    return vec2f(sin(theta) * cos(r), cos(theta) * sin(r));
  }`)

export const exVar = simpleVariation(/* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    let p0 = sin(theta + r);
    let p1 = cos(theta - r);
    let p03 = p0 * p0 * p0;
    let p13 = p1 * p1 * p1;
    return r * vec2f((p03 + p13), (p03 - p13));
  }`)

export const julia = simpleVariation(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let sqrtr = sqrt(length(pos));
    let theta = atan2(pos.y, pos.x);
    let rand = random();
    let omega = select(0, PI, random() > 0.5);
    let angle = theta / 2.0 + omega;
    return sqrtr * vec2f(cos(angle), sin(angle));
  }`,
  { random, PI },
)

export const bent = simpleVariation(/* wgsl */ `
  (pos: vec2f) -> vec2f {
    let fx = select(pos.x, 2.0 * pos.x, pos.x < 0);
    let fy = select(pos.y, pos.y / 2.0, pos.y < 0);
    return vec2f(fx, fy);
  }`)

export const fisheye = simpleVariation(/* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos);
    let factor = 2 / (r + 1); 
    return factor * pos.yx;
  }`)

export const eyefish = simpleVariation(/* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos);
    let factor = 2 / (r + 1); 
    return factor * pos;
  }`)

export const exponential = simpleVariation(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let factor = exp(pos.x - 1);
    let piY = PI * pos.y;
    return factor * vec2f(cos(piY), sin(piY));
  }`,
  { PI },
)

export const power = simpleVariation(/* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    let sinTheta = sin(theta);
    let factor = pow(r, sinTheta);
    return factor * vec2f(cos(theta), sinTheta);
  }`)

export const cosine = simpleVariation(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let piX = PI * pos.x;
    return vec2f(
      cos(piX) * cosh(pos.y),
      -sin(piX) * sinh(pos.y)
    );
  }`,
  { PI },
)
