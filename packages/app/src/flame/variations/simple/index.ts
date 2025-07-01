import { random, randomUnitDisk } from '@/shaders/random'
import { PI } from '../../constants'
import { simpleVariation } from './types'

export const waves = simpleVariation(
  'waves',
  /* wgsl */ `
  (pos: vec2f, varInfo: VariationInfo) -> vec2f {
    let T = varInfo.affineCoefs;
    let xSinArg = pos.y / (T.c * T.c); 
    let ySinArg = pos.x / (T.f * T.f); 
    return vec2f(
      pos.x + T.b * sin(xSinArg),
      pos.y + T.e * sin(ySinArg),
    );
  }`,
)

export const popcorn = simpleVariation(
  'popcorn',
  /* wgsl */ `
  (pos: vec2f, varInfo: VariationInfo) -> vec2f {
    let T = varInfo.affineCoefs;
    return pos + vec2f(
      T.c * sin(tan(3 * pos.y)),
      T.f * sin(tan(3 * pos.x)),
    );
  }`,
)

export const rings = simpleVariation(
  'rings',
  /* wgsl */ `
  (pos: vec2f, varInfo: VariationInfo) -> vec2f {
    let T = varInfo.affineCoefs;
    let c2 = T.c * T.c;
    let r = length(pos); 
    let theta = atan2(pos.y, pos.x);
    let factor = (r + c2) % (2 * c2) - c2 + r * (1 - c2);
    return factor * vec2f(cos(theta), sin(theta));
  }`,
)

export const fan = simpleVariation(
  'fan',
  /* wgsl */ `
  (pos: vec2f, varInfo: VariationInfo) -> vec2f {
    let T = varInfo.affineCoefs;
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
export const linear = simpleVariation(
  'linear',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    return pos;
  }`,
)

export const randomDisk = simpleVariation(
  'randomDisk',
  /* wgsl */ `
  (_pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    return randomUnitDisk();
  }`,
  { randomUnitDisk },
)

export const gaussian = simpleVariation(
  'gaussian',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let r = random() + random() + random() + random() - 2;
    let theta = random() * 2 * PI;
    return r * vec2f(cos(theta), sin(theta));
  }`,
  { random, PI },
)

export const sinusoidal = simpleVariation(
  'sinusoidal',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    return vec2f(sin(pos.x), sin(pos.y));
  }`,
)

export const spherical = simpleVariation(
  'spherical',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let r2 = dot(pos, pos);
    return pos / r2;
  }`,
)

export const swirl = simpleVariation(
  'swirl',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let r2 = dot(pos, pos);
    let s2 = sin(r2);
    let c2 = cos(r2);
    return vec2f(
      pos.x * s2 - pos.y * c2,
      pos.x * c2 + pos.y * s2,
    );
  }`,
)

export const horseshoe = simpleVariation(
  'horseshoe',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let r = length(pos); 
    return vec2f(
      (pos.x - pos.y) * (pos.x + pos.y),
      2 * pos.x * pos.y
    ) / r;
  }`,
)

export const polar = simpleVariation(
  'polar',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let r = length(pos); 
    let theta = atan2(pos.y, pos.x);
    return vec2f(theta / PI, r - 1);
  }`,
  { PI },
)

export const handkerchief = simpleVariation(
  'handkerchief',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let r = length(pos); 
    let theta = atan2(pos.y, pos.x);
    return r * vec2f(sin(theta + r), cos(theta - r));
  }`,
)

export const heart = simpleVariation(
  'heart',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let r = length(pos); 
    let theta = atan2(pos.y, pos.x);
    return r * vec2f(sin(theta * r), -cos(theta * r));
  }`,
)

export const disc = simpleVariation(
  'disc',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    let thOverPi = theta / PI;
    return thOverPi * vec2f(sin(PI * r), cos(PI * r));
  }`,
  { PI },
)

export const spiral = simpleVariation(
  'spiral',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
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

export const hyperbolic = simpleVariation(
  'hyperbolic',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    return vec2f(sin(theta) / r, r * cos(theta));
  }`,
)

export const diamond = simpleVariation(
  'diamond',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    return vec2f(sin(theta) * cos(r), cos(theta) * sin(r));
  }`,
)

export const exVar = simpleVariation(
  'exVar',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    let p0 = sin(theta + r);
    let p1 = cos(theta - r);
    let p03 = p0 * p0 * p0;
    let p13 = p1 * p1 * p1;
    return r * vec2f((p03 + p13), (p03 - p13));
  }`,
)

export const julia = simpleVariation(
  'julia',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let sqrtr = sqrt(length(pos));
    let theta = atan2(pos.y, pos.x);
    let rand = random();
    let omega = select(0, PI, random() > 0.5);
    let angle = theta / 2.0 + omega;
    return sqrtr * vec2f(cos(angle), sin(angle));
  }`,
  { random, PI },
)

export const bent = simpleVariation(
  'bent',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let fx = select(pos.x, 2.0 * pos.x, pos.x < 0);
    let fy = select(pos.y, pos.y / 2.0, pos.y < 0);
    return vec2f(fx, fy);
  }`,
)

export const fisheye = simpleVariation(
  'fisheye',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let r = length(pos);
    let factor = 2 / (r + 1); 
    return factor * pos.yx;
  }`,
)

export const eyefish = simpleVariation(
  'eyefish',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let r = length(pos);
    let factor = 2 / (r + 1); 
    return factor * pos;
  }`,
)

export const exponential = simpleVariation(
  'exponential',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let factor = exp(pos.x - 1);
    let piY = PI * pos.y;
    return factor * vec2f(cos(piY), sin(piY));
  }`,
  { PI },
)

export const power = simpleVariation(
  'power',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    let sinTheta = sin(theta);
    let factor = pow(r, sinTheta);
    return factor * vec2f(cos(theta), sinTheta);
  }`,
)

export const cosine = simpleVariation(
  'cosine',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let piX = PI * pos.x;
    return vec2f(
      cos(piX) * cosh(pos.y),
      -sin(piX) * sinh(pos.y)
    );
  }`,
  { PI },
)

export const bubble = simpleVariation(
  'bubble',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let r = length(pos);
    let r2 = r * r;
    let factor = 4 / (r2 + 4);
    return factor * vec2f(pos.x, pos.y);
  }`,
)

export const cylinder = simpleVariation(
  'cylinder',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    return vec2f(sin(pos.x), pos.y);
  }`,
)

export const noise = simpleVariation(
  'noise',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let rand = random();
    let angle = 2 * PI * random();
    return rand * vec2f(pos.x * cos(angle), pos.y * sin(angle));
  }`,
  { random, PI },
)

export const blurVar = simpleVariation(
  'blurVar',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let rand = random();
    let angle = 2 * PI * random();
    return rand * vec2f(cos(angle), sin(angle));
  }`,
  { random, PI },
)

export const archVar = simpleVariation(
  'archVar',
  /* wgsl */ `
  (pos: vec2f, varInfo: VariationInfo) -> vec2f {
    let weight = varInfo.weight;
    let angle = random() * PI * weight;
    return vec2f(
      sin(angle), 
      (sin(angle) * sin(angle)) / cos(angle)
    );
  }`,
  { random, PI },
)

export const tangentVar = simpleVariation(
  'tangentVar',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    return vec2f(
      sin(pos.x) / cos(pos.y), 
      tan(pos.y)
    );
  }`,
)

export const squareVar = simpleVariation(
  'squareVar',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let randX = random();
    let randY = random();
    return vec2f(
      randX - 0.5,
      randY - 0.5,
    );
  }`,
  { random },
)

export const raysVar = simpleVariation(
  'raysVar',
  /* wgsl */ `
  (pos: vec2f, varInfo: VariationInfo) -> vec2f {
    let weight = varInfo.weight;
    let rand = random();
    let r = length(pos);
    let angle = rand * PI * weight;
    let fact = (weight * tan(angle)) / (r * r);
    return fact * vec2f(
      cos(pos.x),
      sin(pos.y)
    );
  }`,
  { random, PI },
)

export const bladeVar = simpleVariation(
  'bladeVar',
  /* wgsl */ `
  (pos: vec2f, varInfo: VariationInfo) -> vec2f {
    let weight = varInfo.weight;
    let rand = random();
    let r = length(pos);
    let angle = rand * r * weight;
    return pos.x * vec2f(
      cos(angle) + sin(angle),
      cos(angle) - sin(angle),
    );
  }`,
  { random, PI },
)

export const secantVar = simpleVariation(
  'secantVar',
  /* wgsl */ `
  (pos: vec2f, varInfo: VariationInfo) -> vec2f {
    let weight = varInfo.weight;
    let r = length(pos);
    let angle = weight * r;
    return  vec2f(
      pos.x,
      1 / (weight * cos(angle))
    );
  }`,
  { PI },
)

export const twintrianVar = simpleVariation(
  'twintrianVar',
  /* wgsl */ `
  (pos: vec2f, varInfo: VariationInfo) -> vec2f {
    let weight = varInfo.weight;
    let r = length(pos);
    let angle = random() * r * weight;
    let sinAngle = sin(angle);
    let t = (log(sinAngle * sinAngle) / log(10)) + cos(angle);
    return pos.x * vec2f(
      t,
      t - PI * sinAngle
    );
  }`,
  { random, PI },
)

export const crossVar = simpleVariation(
  'crossVar',
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo) -> vec2f {
    let squareDiff = (pos.x * pos.x - pos.y * pos.y);
    let fact = sqrt(1/(squareDiff * squareDiff));
    return fact * vec2f(
      pos.x,
      pos.y,
    );
  }`,
  { PI },
)
