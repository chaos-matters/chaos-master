import { f32, i32, struct, vec3f } from 'typegpu/data'
import { acos, atan2, cos, floor, length, select, sin, sqrt, tan, } from 'typegpu/std'
import { createObjectEditor, sliderEditor, sliderLogEditor, } from '@/components/Sliders/ParametricEditors/sliderEditor'
import { random } from '@/shaders/random'
import { PI } from '../../constants'
import { parametricVariation3D } from './types'

export const waves3D = parametricVariation3D(
  'waves3D',
  struct({
    scaleX: f32,
    scaleY: f32,
    scaleZ: f32,
    freqX: f32,
    freqY: f32,
    freqZ: f32,
  }),
  {
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    freqX: 1,
    freqY: 1,
    freqZ: 1,
  },
  createObjectEditor({
    scaleX: sliderEditor({ min: 0.1, max: 10, step: 0.1 }),
    scaleY: sliderEditor({ min: 0.1, max: 10, step: 0.1 }),
    scaleZ: sliderEditor({ min: 0.1, max: 10, step: 0.1 }),
    freqX: sliderEditor({ min: 0.1, max: 10, step: 0.1 }),
    freqY: sliderEditor({ min: 0.1, max: 10, step: 0.1 }),
    freqZ: sliderEditor({ min: 0.1, max: 10, step: 0.1 }),
  }),
  (pos, _varInfo, params) => {
    'use gpu'
    return vec3f(
      pos.x + params.scaleX * sin(pos.y * params.freqX),
      pos.y + params.scaleY * sin(pos.z * params.freqY),
      pos.z + params.scaleZ * sin(pos.x * params.freqZ),
    )
  },
)

export const rings3D = parametricVariation3D(
  'rings3D',
  struct({
    radiusScale: f32,
  }),
  { radiusScale: 1 },
  createObjectEditor({
    radiusScale: sliderLogEditor({ min: 0.01, max: 10, step: 0.01 }),
  }),
  (pos, _varInfo, params) => {
    'use gpu'
    const r = length(pos)
    const scale = params.radiusScale
    const t = (r % (2 * scale)) - scale + r * (1 - scale)
    return pos.mul(t / (r + 1e-6))
  },
)

export const pdj3D = parametricVariation3D(
  'pdj3D',
  struct({
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    e: f32,
    f: f32,
  }),
  { a: 0.1, b: 1.9, c: -0.8, d: -1.2, e: 0.5, f: -0.5 },
  createObjectEditor({
    a: sliderEditor({ min: -3, max: 3, step: 0.01 }),
    b: sliderEditor({ min: -3, max: 3, step: 0.01 }),
    c: sliderEditor({ min: -3, max: 3, step: 0.01 }),
    d: sliderEditor({ min: -3, max: 3, step: 0.01 }),
    e: sliderEditor({ min: -3, max: 3, step: 0.01 }),
    f: sliderEditor({ min: -3, max: 3, step: 0.01 }),
  }),
  (pos, _varInfo, params) => {
    'use gpu'
    return vec3f(
      sin(params.a * pos.y) - cos(params.b * pos.x),
      sin(params.c * pos.z) - cos(params.d * pos.y),
      sin(params.e * pos.x) - cos(params.f * pos.z),
    )
  },
)

export const fan3D = parametricVariation3D(
  'fan3D',
  struct({
    spreadTheta: f32,
    spreadPhi: f32,
  }),
  { spreadTheta: PI.$, spreadPhi: PI.$ / 2 },
  createObjectEditor({
    spreadTheta: sliderEditor({ min: 0, max: Math.PI * 2, step: 0.01 }),
    spreadPhi: sliderEditor({ min: 0, max: Math.PI, step: 0.01 }),
  }),
  (pos, _varInfo, params) => {
    'use gpu'
    const r = length(pos) + 1e-6
    const theta = atan2(pos.y, pos.x)
    const phi = acos(pos.z / r)
    const t = theta + params.spreadTheta / 2
    const p = phi + params.spreadPhi / 2

    // integer truncation in wgsl
    // using floor since wgsl modulo can behave differently for negative
    const ft = t - params.spreadTheta * f32(i32(t / params.spreadTheta))
    const fp = p - params.spreadPhi * f32(i32(p / params.spreadPhi))

    const newTheta = theta - ft + params.spreadTheta / 2
    const newPhi = phi - fp + params.spreadPhi / 2

    return vec3f(
      sin(newPhi) * cos(newTheta),
      sin(newPhi) * sin(newTheta),
      cos(newPhi),
    ).mul(r)
  },
)

export const popcorn3D = parametricVariation3D(
  'popcorn3D',
  struct({
    c: f32,
    f: f32,
  }),
  { c: 1, f: 3 },
  createObjectEditor({
    c: sliderEditor({ min: 0, max: 5, step: 0.01 }),
    f: sliderEditor({ min: 0, max: 10, step: 0.1 }),
  }),
  (pos, _varInfo, params) => {
    'use gpu'
    const dx = params.c * sin(tan(params.f * pos.y))
    const dy = params.c * sin(tan(params.f * pos.z))
    const dz = params.c * sin(tan(params.f * pos.x))
    return vec3f(pos.x + dx, pos.y + dy, pos.z + dz)
  },
)

export const blurLinear3D = parametricVariation3D(
  'blurLinear3D',
  struct({
    radius: f32,
    theta: f32,
    phi: f32,
  }),
  { radius: 1, theta: 0, phi: Math.PI / 2 },
  createObjectEditor({
    radius: sliderLogEditor({ min: 0.01, max: 10, step: 0.01 }),
    theta: sliderEditor({ min: 0, max: Math.PI * 2, step: 0.01 }),
    phi: sliderEditor({ min: 0, max: Math.PI, step: 0.01 }),
  }),
  (pos, _varInfo, params) => {
    'use gpu'
    // Map random variable [0..1] to [-1..1]
    const r = (random() + random()) * 0.5 - 0.5
    const dir = vec3f(
      sin(params.phi) * cos(params.theta),
      sin(params.phi) * sin(params.theta),
      cos(params.phi),
    )
    return vec3f(
      pos.x + dir.x * r * params.radius,
      pos.y + dir.y * r * params.radius,
      pos.z + dir.z * r * params.radius,
    )
  },
  'blur',
)

// ── Simple ports of 2D parametric variations, extended per-axis with z ──
// Note: 3D variation impls must NOT multiply by weight — createFlameWgsl3D
// applies the variation weight externally (`weight * fn(...)`).

export const rectangles3D = parametricVariation3D(
  'rectangles3D',
  struct({ x: f32, y: f32, z: f32 }),
  { x: 2, y: 3, z: 2 },
  createObjectEditor({
    x: sliderEditor({ min: 0.1, max: 20, step: 0.1 }),
    y: sliderEditor({ min: 0.1, max: 20, step: 0.1 }),
    z: sliderEditor({ min: 0.1, max: 20, step: 0.1 }),
  }),
  (pos, _varInfo, P) => {
    'use gpu'
    return vec3f(
      (2 * floor(pos.x / P.x) + 1) * P.x - pos.x,
      (2 * floor(pos.y / P.y) + 1) * P.y - pos.y,
      (2 * floor(pos.z / P.z) + 1) * P.z - pos.z,
    )
  },
)

export const splits3D = parametricVariation3D(
  'splits3D',
  struct({ x: f32, y: f32, z: f32 }),
  { x: 0.4, y: 0.6, z: 0.5 },
  createObjectEditor({
    x: sliderEditor({ min: -2, max: 2, step: 0.01 }),
    y: sliderEditor({ min: -2, max: 2, step: 0.01 }),
    z: sliderEditor({ min: -2, max: 2, step: 0.01 }),
  }),
  (pos, _varInfo, P) => {
    'use gpu'
    return vec3f(
      pos.x + select(-P.x, P.x, pos.x >= 0),
      pos.y + select(-P.y, P.y, pos.y >= 0),
      pos.z + select(-P.z, P.z, pos.z >= 0),
    )
  },
)

export const modulus3D = parametricVariation3D(
  'modulus3D',
  struct({ x: f32, y: f32, z: f32 }),
  { x: 0.5, y: 0.5, z: 0.5 },
  createObjectEditor({
    x: sliderEditor({ min: 0.01, max: 3, step: 0.01 }),
    y: sliderEditor({ min: 0.01, max: 3, step: 0.01 }),
    z: sliderEditor({ min: 0.01, max: 3, step: 0.01 }),
  }),
  (pos, _varInfo, P) => {
    'use gpu'
    const xr = 2 * P.x
    const yr = 2 * P.y
    const zr = 2 * P.z
    let nx = pos.x
    if (pos.x > xr) {
      nx = -P.x + ((pos.x + P.x) % xr)
    } else if (pos.x < -xr) {
      nx = P.x - ((P.x - pos.x) % xr)
    }
    let ny = pos.y
    if (pos.y > yr) {
      ny = -P.y + ((pos.y + P.y) % yr)
    } else if (pos.y < -yr) {
      ny = P.y - ((P.y - pos.y) % yr)
    }
    let nz = pos.z
    if (pos.z > zr) {
      nz = -P.z + ((pos.z + P.z) % zr)
    } else if (pos.z < -zr) {
      nz = P.z - ((P.z - pos.z) % zr)
    }
    return vec3f(nx, ny, nz)
  },
)

export const separation3D = parametricVariation3D(
  'separation3D',
  struct({
    x: f32,
    xInside: f32,
    y: f32,
    yInside: f32,
    z: f32,
    zInside: f32,
  }),
  { x: 0.5, xInside: 0.05, y: 0.25, yInside: 0.025, z: 0.25, zInside: 0.025 },
  createObjectEditor({
    x: sliderEditor({ min: 0, max: 2, step: 0.01 }),
    xInside: sliderEditor({ min: 0, max: 1, step: 0.001 }),
    y: sliderEditor({ min: 0, max: 2, step: 0.01 }),
    yInside: sliderEditor({ min: 0, max: 1, step: 0.001 }),
    z: sliderEditor({ min: 0, max: 2, step: 0.01 }),
    zInside: sliderEditor({ min: 0, max: 1, step: 0.001 }),
  }),
  (pos, _varInfo, P) => {
    'use gpu'
    const sx2 = P.x * P.x
    const sy2 = P.y * P.y
    const sz2 = P.z * P.z
    return vec3f(
      select(
        -(sqrt(pos.x * pos.x + sx2) + pos.x * P.xInside),
        sqrt(pos.x * pos.x + sx2) - pos.x * P.xInside,
        pos.x > 0,
      ),
      select(
        -(sqrt(pos.y * pos.y + sy2) + pos.y * P.yInside),
        sqrt(pos.y * pos.y + sy2) - pos.y * P.yInside,
        pos.y > 0,
      ),
      select(
        -(sqrt(pos.z * pos.z + sz2) + pos.z * P.zInside),
        sqrt(pos.z * pos.z + sz2) - pos.z * P.zInside,
        pos.z > 0,
      ),
    )
  },
)

export const blob3D = parametricVariation3D(
  'blob3D',
  struct({ high: f32, low: f32, waves: f32 }),
  { high: 2, low: 1, waves: 3 },
  createObjectEditor({
    high: sliderEditor({ min: 0, max: 20, step: 0.1 }),
    low: sliderEditor({ min: 0, max: 20, step: 0.1 }),
    waves: sliderEditor({ min: -20, max: 20, step: 1 }),
  }),
  (pos, _varInfo, P) => {
    'use gpu'
    const theta = atan2(pos.y, pos.x)
    const sinFactor = (P.high - P.low) / 2
    const blobFact = P.low + sinFactor * (sin(P.waves * theta) + 1)
    return pos.mul(blobFact)
  },
)

export const bent2_3D = parametricVariation3D(
  'bent2_3D',
  struct({ x: f32, y: f32, z: f32 }),
  { x: 1, y: 1, z: 1 },
  createObjectEditor({
    x: sliderEditor({ min: -2, max: 2, step: 0.01 }),
    y: sliderEditor({ min: -2, max: 2, step: 0.01 }),
    z: sliderEditor({ min: -2, max: 2, step: 0.01 }),
  }),
  (pos, _varInfo, P) => {
    'use gpu'
    return vec3f(
      select(pos.x, pos.x * P.x, pos.x < 0),
      select(pos.y, pos.y * P.y, pos.y < 0),
      select(pos.z, pos.z * P.z, pos.z < 0),
    )
  },
)

export const zScale3D = parametricVariation3D(
  'zScale3D',
  struct({ scale: f32 }),
  { scale: 1 },
  createObjectEditor({
    scale: sliderEditor({ min: -3, max: 3, step: 0.01 }),
  }),
  (pos, _varInfo, P) => {
    'use gpu'
    return vec3f(pos.x, pos.y, pos.z * P.scale)
  },
)
