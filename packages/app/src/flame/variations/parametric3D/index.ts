import { f32, i32, struct, vec3f } from 'typegpu/data'
import { acos, atan2, cos, length, sin, tan } from 'typegpu/std'
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
