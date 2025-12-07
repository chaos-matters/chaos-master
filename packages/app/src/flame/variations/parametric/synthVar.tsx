import { f32, struct, vec2f, vec3f } from 'typegpu/data'
import {
  asin,
  atan2,
  cos,
  floor,
  length,
  pow,
  select,
  sin,
  sqrt,
} from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS, PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

// TODO: Not included yet, since its quite a heavy variation (slows down whole app)
const SynthVarParams = struct({
  a: f32,
  mode: f32,
  power: f32,
  mix: f32,
  smoothFact: f32,
  b: f32,
  b_type: f32,
  b_skew: f32,
  b_frq: f32,
  b_phs: f32,
  b_layer: f32,
  c: f32,
  c_type: f32,
  c_skew: f32,
  c_frq: f32,
  c_phs: f32,
  c_layer: f32,
  d: f32,
  d_type: f32,
  d_skew: f32,
  d_frq: f32,
  d_phs: f32,
  d_layer: f32,
  e: f32,
  e_type: f32,
  e_skew: f32,
  e_frq: f32,
  e_phs: f32,
  e_layer: f32,
  f: f32,
  f_type: f32,
  f_skew: f32,
  f_frq: f32,
  f_phs: f32,
  f_layer: f32,
})

type SynthVarParams = Infer<typeof SynthVarParams>

const SynthVarParamsDefaults: SynthVarParams = {
  a: 1.0,
  mode: 3,
  power: -2.0,
  mix: 1.0,
  smoothFact: 0,
  b: 0.0,
  b_type: 0,
  b_skew: 0.0,
  b_frq: 1.0,
  b_phs: 0.0,
  b_layer: 0,
  c: 0.0,
  c_type: 0,
  c_skew: 0.0,
  c_frq: 1.0,
  c_phs: 0.0,
  c_layer: 0,
  d: 0.0,
  d_type: 0,
  d_skew: 0.0,
  d_frq: 1.0,
  d_phs: 0.0,
  d_layer: 0,
  e: 0.0,
  e_type: 0,
  e_skew: 0.0,
  e_frq: 1.0,
  e_phs: 0.0,
  e_layer: 0,
  f: 0.0,
  f_type: 0,
  f_skew: 0.0,
  f_frq: 1.0,
  f_phs: 0.0,
  f_layer: 0,
}

const SynthVarParamsEditor: EditorFor<SynthVarParams> = (props) => (
  <>
    {/* Base Parameters */}
    <RangeEditor
      {...editorProps(props, 'a', 'A')}
      min={-5}
      max={5}
      step={0.01}
    />
    {/* TODO: should be pickbox/selector for each enumearated mode above */}
    <RangeEditor
      {...editorProps(props, 'mode', 'Mode')}
      min={0}
      max={19}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'power', 'Power')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'mix', 'Mix')}
      min={0}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'smoothFact', 'Smoothness')}
      min={0}
      max={2}
      step={1}
    />
    {/* Group B */}
    <RangeEditor
      {...editorProps(props, 'b', 'B')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b_type', 'B Type')}
      min={0}
      max={8}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'b_skew', 'B Skew')}
      min={-1}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b_frq', 'B Freq')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b_phs', 'B Phase')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b_layer', 'B Layer')}
      min={0}
      max={3}
      step={1}
    />
    {/* Group C */}
    <RangeEditor
      {...editorProps(props, 'c', 'C')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c_type', 'C Type')}
      min={0}
      max={8}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'c_skew', 'C Skew')}
      min={-1}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c_frq', 'C Freq')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c_phs', 'C Phase')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c_layer', 'C Layer')}
      min={0}
      max={3}
      step={1}
    />
    {/* Group D */}
    <RangeEditor
      {...editorProps(props, 'd', 'D')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'd_type', 'D Type')}
      min={0}
      max={8}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'd_skew', 'D Skew')}
      min={-1}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'd_frq', 'D Freq')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'd_phs', 'D Phase')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'd_layer', 'D Layer')}
      min={0}
      max={3}
      step={1}
    />
    {/* Group E */}
    <RangeEditor
      {...editorProps(props, 'e', 'E')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'e_type', 'E Type')}
      min={0}
      max={8}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'e_skew', 'E Skew')}
      min={-1}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'e_frq', 'E Freq')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'e_phs', 'E Phase')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'e_layer', 'E Layer')}
      min={0}
      max={3}
      step={1}
    />
    {/* Group F */}
    <RangeEditor
      {...editorProps(props, 'f', 'F')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'f_type', 'F Type')}
      min={0}
      max={8}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'f_skew', 'F Skew')}
      min={-1}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'f_frq', 'F Freq')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'f_phs', 'F Phase')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'f_layer', 'F Layer')}
      min={0}
      max={3}
      step={1}
    />
  </>
)

function bezier_quad_map(xin: number, min: number) {
  'use gpu'
  let a = f32(1.0) // a is used to control sign of result
  let t = f32(0.0) // t is the Bezier curve parameter
  let x = f32(xin)
  let m = f32(min)

  // Simply reflect in the y axis for negative values
  if (m < 0.0) {
    m = -m
    a = -1.0
  }
  if (x < 0.0) {
    x = -x
    a = -a
  }

  // iM is "inverse m" used in a few places below
  let iM = f32(1e10)
  if (m > 1.0e-10) {
    iM = 1.0 / m
  }

  const L = select(2.0 * m, 2.0 - m, 2.0 - m > 2.0 * m)

  // "Non Curved"
  // Covers x >= L, or always true if m === 1.0
  // y = x  i.e. not distorted
  if (x > L || m === 1.0) {
    return a * x
  }

  if (m < 1.0 && x <= 1.0) {
    // Bezier Curve #1
    // Covers 0 <= $m <= 1.0, 0 <= $x <= 1.0
    // Control points are (0,0), (m,m) and (1,m)

    t = x // Special case when m === 0.5
    if ((m - 0.5) * (m - 0.5) > 1e-10) {
      t = (-1.0 * m + sqrt(m * m + (1.0 - 2.0 * m) * x)) / (1.0 - 2.0 * m)
    }

    return a * (x + (m - 1.0) * t * t)
  }

  if (1.0 < m && x <= 1.0) {
    // Bezier Curve #2
    // Covers m >= 1.0, 0 <= x <= 1.0
    // Control points are (0,0), (iM,iM) and (1,m)

    t = x // Special case when m === 2
    if ((m - 2.0) * (m - 2.0) > 1e-10) {
      t = (-1.0 * iM + sqrt(iM * iM + (1.0 - 2.0 * iM) * x)) / (1 - 2 * iM)
    }
    return a * (x + (m - 1.0) * t * t)
  }

  // Deliberate divide by zero to rule out code causing a bug

  if (m < 1.0) {
    // Bezier Curve #3
    // Covers 0 <= m <= 1.0, 1 <= x <= L
    // Control points are (1,m), (1,1) and (L,L)
    // (L is x value (>1) where we re-join y = x line, and is maximum( iM, 2 * m )

    t = sqrt((x - 1.0) / (L - 1.0))
    return a * (x + (m - 1.0) * t * t + 2 * (1.0 - m) * t + (m - 1.0))
  }

  // Curve #4
  // Covers 1.0 <= m, 1 <= x <= L
  // Control points are (1,m), (m,m) and (L,L)
  // (L is x value (>1) where we re-join y = x line, and is maximum( iM, 2 *  m )

  t = 1.0 - m + sqrt((m - 1.0) * (m - 1.0) + (x - 1.0))
  return a * (x + (m - 1.0) * t * t - 2.0 * (m - 1.0) * t + (m - 1.0))
}

const MODE_SPHERICAL = 0
const MODE_BUBBLE = 1
const MODE_BLUR_LEGACY = 2
const MODE_BLUR_NEW = 3
const MODE_BLUR_ZIGZAG = 4
const MODE_RAWCIRCLE = 5
const MODE_RAWX = 6
const MODE_RAWY = 7
const MODE_RAWXY = 8
const MODE_SHIFTX = 9
const MODE_SHIFTY = 10
const MODE_SHIFTXY = 11
const MODE_BLUR_RING = 12
const MODE_BLUR_RING2 = 13
const MODE_SHIFTNSTRETCH = 14
const MODE_SHIFTTANGENT = 15
const MODE_SHIFTTHETA = 16
const MODE_XMIRROR = 17
const MODE_XYMIRROR = 18
const MODE_SPHERICAL2 = 19

const MODE_SINUSOIDAL = 1001
const MODE_SWIRL = 1002
const MODE_HYPERBOLIC = 1003
const MODE_JULIA = 1004
const MODE_DISC = 1005
const MODE_RINGS = 1006
const MODE_CYLINDER = 1007

const LAYER_ADD = 0
const LAYER_MULT = 1
const LAYER_MAX = 2
const LAYER_MIN = 3
const LERP_LINEAR = 1
const LERP_BEZIER = 2
const WAVE_SIN = 0
const WAVE_COS = 1
const WAVE_SQUARE = 2
const WAVE_SAW = 3
const WAVE_TRIANGLE = 4
const WAVE_CONCAVE = 5
const WAVE_CONVEX = 6
const WAVE_NGON = 7
const WAVE_INGON = 8

const SINCOS_MULTIPLY = 0
const SINCOS_MIXIN = 1

function synthsincos(theta: number, P: SynthVarParams) {
  'use gpu'
  const sineType = P.smoothFact
  let s = sin(theta)
  let c = cos(theta)

  if (floor(sineType) === SINCOS_MULTIPLY) {
    s = s * synthValue(theta, P)
    c = c * synthValue(theta + PI.$ / 2.0, P)
  } else if (floor(sineType) === SINCOS_MIXIN) {
    s = (1.0 - P.mix) * s + (synthValue(theta, P) - 1.0)
    c = (1.0 - P.mix) * c + (synthValue(theta + PI.$ / 2.0, P) - 1.0)
  }

  return vec2f(s, c)
}

function synth_sub_calc(
  xin: number,
  yin: number,
  zin: number,
  type: number,
  frq: number,
) {
  'use gpu'
  const t = floor(type)
  let x = f32(xin)
  let y = f32(yin)
  let z = f32(zin)

  if (t === WAVE_SIN) x = sin(y * 2 * PI.$)
  else if (t === WAVE_COS) x = cos(y * 2 * PI.$)
  else if (t === WAVE_SQUARE) x = f32(select(-1.0, 1.0, y > 0.5))
  else if (t === WAVE_SAW) x = 1.0 - 2.0 * y
  else if (t === WAVE_TRIANGLE)
    x = f32(select(2.0 * y - 1.0, 3.0 - 4.0 * y, y > 0.5))
  else if (t === WAVE_CONCAVE) x = 8.0 * (y - 0.5) * (y - 0.5) - 1.0
  else if (t === WAVE_CONVEX) x = 2.0 * sqrt(y) - 1.0
  else if (t === WAVE_NGON) {
    y -= 0.5
    y *= (2.0 * PI.$) / frq
    x = 1.0 / (cos(y) + EPS.$) - 1.0
  } else if (t === WAVE_INGON) {
    y -= 0.5
    y *= (2.0 * PI.$) / frq
    z = cos(y)
    x = z / (1.0 + EPS.$ - z)
  }
  return vec3f(x, y, z)
}

function process_layer(
  theta: number,
  amp: number,
  type: number,
  skew: number,
  frq: number,
  phs: number,
  layerMode: number,
  currentFactor: number,
): number {
  'use gpu'
  if (amp === 0.0) return currentFactor
  let x = f32(0.0)
  let z = f32(phs + theta * frq)
  let y = f32(z / (2 * PI.$))
  y -= floor(y)

  if (skew !== 0.0) {
    z = 0.5 + 0.5 * skew
    if (y > z) y = 0.5 + (0.5 * (y - z)) / (1.0 - z + 0.000001)
    else y = 0.5 - (0.5 * (z - y)) / (z + 0.000001)
  }

  const newVal = synth_sub_calc(x, y, z, type, frq)
  x = newVal.x
  y = newVal.y
  z = newVal.z

  const lm = floor(layerMode)
  if (lm === LAYER_ADD) return currentFactor + amp * x
  if (lm === LAYER_MULT) return currentFactor * (1.0 + amp * x)
  if (lm === LAYER_MAX) {
    const v = currentFactor + amp * x
    return select(v, currentFactor, currentFactor > v)
  }
  if (lm === LAYER_MIN) {
    const v = currentFactor + amp * x
    return select(v, currentFactor, currentFactor < v)
  }
  return currentFactor
}

const interpolate = (x: number, m: number, lerp_type: number) => {
  'use gpu'
  if (lerp_type === LERP_LINEAR) {
    return x * m
  } else if (lerp_type === LERP_BEZIER) {
    return bezier_quad_map(x, m)
  }
  return x * m
}

const synthValue = (theta: number, P: SynthVarParams) => {
  'use gpu'
  let tf = P.a
  tf = process_layer(
    theta,
    P.b,
    P.b_type,
    P.b_skew,
    P.b_frq,
    P.b_phs,
    P.b_layer,
    tf,
  )
  tf = process_layer(
    theta,
    P.c,
    P.c_type,
    P.c_skew,
    P.c_frq,
    P.c_phs,
    P.c_layer,
    tf,
  )
  tf = process_layer(
    theta,
    P.d,
    P.d_type,
    P.d_skew,
    P.d_frq,
    P.d_phs,
    P.d_layer,
    tf,
  )
  tf = process_layer(
    theta,
    P.e,
    P.e_type,
    P.e_skew,
    P.e_frq,
    P.e_phs,
    P.e_layer,
    tf,
  )
  tf = process_layer(
    theta,
    P.f,
    P.f_type,
    P.f_skew,
    P.f_frq,
    P.f_phs,
    P.f_layer,
    tf,
  )
  return tf * P.mix + (1.0 - P.mix)
}
export const synthVar = parametricVariation(
  'synthVar',
  SynthVarParams,
  SynthVarParamsDefaults,
  SynthVarParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'
    const mode = floor(P.mode)
    let Vx = f32(pos.x)
    let Vy = f32(pos.y)
    let radius = f32(0.0)
    let theta = f32(0.0)
    let theta_factor = f32(0.0)
    let s = f32(0.0)
    let c = f32(0.0)

    let newX = f32(0.0)
    let newY = f32(0.0)

    if (mode === MODE_RAWCIRCLE) {
      radius = length(pos)
      theta = atan2(Vx, Vy)
      theta_factor = synthValue(theta, P)
      radius = interpolate(radius, theta_factor, P.smoothFact)
      s = sin(theta)
      c = cos(theta)
      newX = radius * s
      newY = radius * c
    } else if (mode === MODE_RAWY) {
      // MODE_RAWY
      theta_factor = synthValue(Vx, P)
      newX = Vx
      newY = interpolate(Vy, theta_factor, P.smoothFact)
    } else if (mode === MODE_RAWX) {
      // MODE_RAWX
      theta_factor = synthValue(Vy, P)
      newX = interpolate(Vx, theta_factor, P.smoothFact)
      newY = Vy
    } else if (mode === MODE_RAWXY) {
      // MODE_RAWXY
      theta_factor = synthValue(Vy, P)
      newX = interpolate(Vx, theta_factor, P.smoothFact)
      theta_factor = synthValue(Vx, P)
      newY = interpolate(Vy, theta_factor, P.smoothFact)
    } else if (mode === MODE_SPHERICAL) {
      // MODE_SPHERICAL
      radius = pow(Vx * Vx + Vy * Vy + EPS.$, (P.power + 1.0) / 2.0)
      theta = atan2(Vx, Vy)
      theta_factor = synthValue(theta, P)
      radius = interpolate(radius, theta_factor, P.smoothFact)
      s = sin(theta)
      c = cos(theta)
      newX = radius * s
      newY = radius * c
    } else if (mode === MODE_BUBBLE) {
      // MODE_BUBBLE
      const mag = Vx * Vx + Vy * Vy
      radius = sqrt(mag) / (mag / 4.0 + 1.0)
      theta = atan2(Vx, Vy)
      theta_factor = synthValue(theta, P)
      radius = interpolate(radius, theta_factor, P.smoothFact)
      s = sin(theta)
      c = cos(theta)
      newX = radius * s
      newY = radius * c
    } else if (mode === MODE_BLUR_LEGACY) {
      // MODE_BLUR_LEGACY
      radius = (random() + random() + 0.002 * random()) / 2.002
      theta = 2.0 * PI.$ * random() - PI.$
      Vx = radius * sin(theta)
      Vy = radius * cos(theta)
      radius = pow(radius * radius + EPS.$, P.power / 2.0)
      theta_factor = synthValue(theta, P)
      radius = interpolate(radius, theta_factor, P.smoothFact)
      // Note: Java code adds Vx*radius, Vy*radius to pVarTP
      // We treat this as the result vector
      newX = Vx * radius
      newY = Vy * radius
    } else if (mode === MODE_BLUR_NEW) {
      // MODE_BLUR_NEW
      radius = 0.5 * (random() + random())
      theta = 2.0 * PI.$ * random() - PI.$
      radius = pow(radius * radius + EPS.$, -P.power / 2.0)
      theta_factor = synthValue(theta, P)
      radius = interpolate(radius, theta_factor, P.smoothFact)
      s = sin(theta)
      c = cos(theta)
      newX = radius * s
      newY = radius * c
    } else if (mode === MODE_BLUR_RING) {
      // MODE_BLUR_RING
      radius = 1.0 + 0.1 * (random() + random() - 1.0) * P.power
      theta = 2.0 * PI.$ * random() - PI.$
      theta_factor = synthValue(theta, P)
      radius = interpolate(radius, theta_factor, P.smoothFact)
      s = sin(theta)
      c = cos(theta)
      newX = radius * s
      newY = radius * c
    } else if (mode === MODE_BLUR_RING2) {
      // MODE_BLUR_RING2
      theta = 2.0 * PI.$ * random() - PI.$
      radius = pow(random() + EPS.$, P.power)
      radius = synthValue(theta, P) + 0.1 * radius
      s = sin(theta)
      c = cos(theta)
      newX = radius * s
      newY = radius * c
    } else if (mode === MODE_SHIFTNSTRETCH) {
      // MODE_SHIFTNSTRETCH
      radius = pow(Vx * Vx + Vy * Vy + EPS.$, P.power / 2.0)
      theta = atan2(Vx, Vy) - 1.0 + synthValue(radius, P)
      s = sin(theta)
      c = cos(theta)
      newX = radius * s
      newY = radius * c
    } else if (mode === MODE_SHIFTTANGENT) {
      // MODE_SHIFTTANGENT
      radius = pow(Vx * Vx + Vy * Vy + EPS.$, P.power / 2.0)
      theta = atan2(Vx, Vy)
      s = sin(theta)
      c = cos(theta)
      const mu = synthValue(radius, P) - 1.0
      Vx = Vx + mu * c
      Vy = Vy - mu * s
      newX = Vx
      newY = Vy
    } else if (mode === MODE_SHIFTTHETA) {
      // MODE_SHIFTTHETA
      radius = pow(Vx * Vx + Vy * Vy + EPS.$, P.power / 2.0)
      theta = atan2(Vx, Vy) - 1.0 + synthValue(radius, P)
      s = sin(theta)
      c = cos(theta)
      // Note: Java calculates radius AGAIN from original Vx,Vy but variable 'radius' was overwritten.
      // However, in Java 'radius' was overwritten by pow result.
      // Then 'radius = sqrt(Vx*Vx + Vy*Vy)' uses original coords (pAffineTP).
      radius = length(pos)
      newX = radius * s
      newY = radius * c
    } else if (mode === MODE_BLUR_ZIGZAG) {
      // MODE_BLUR_ZIGZAG
      Vy = 1.0 + 0.1 * (random() + random() - 1.0) * P.power
      theta = 2.0 * asin((random() - 0.5) * 2.0)
      theta_factor = synthValue(theta, P)
      Vy = interpolate(Vy, theta_factor, P.smoothFact)
      newX = theta / PI.$
      newY = Vy - 1.0
    } else if (mode === MODE_SHIFTX) {
      // MODE_SHIFTX
      newX = Vx + synthValue(Vy, P) - 1.0
      newY = Vy
    } else if (mode === MODE_SHIFTY) {
      // MODE_SHIFTY
      newX = Vx
      newY = Vy + synthValue(Vx, P) - 1.0
    } else if (mode === MODE_SHIFTXY) {
      // MODE_SHIFTXY
      newX = Vx + synthValue(Vy, P) - 1.0
      newY = Vy + synthValue(Vx, P) - 1.0
    } else if (mode === MODE_SINUSOIDAL) {
      // MODE_SINUSOIDAL
      newX = Vx + (synthValue(Vx, P) - 1.0 + (1.0 - P.mix) * sin(Vx))
      newY = Vy + (synthValue(Vy, P) - 1.0 + (1.0 - P.mix) * sin(Vy))
    } else if (mode === MODE_SWIRL) {
      // MODE_SWIRL
      radius = pow(Vx * Vx + Vy * Vy + EPS.$, P.power / 2.0)
      const pair = synthsincos(radius, P)
      s = pair.x
      c = pair.y
      newX = s * Vx - c * Vy
      newY = c * Vx + s * Vy
    } else if (mode === MODE_HYPERBOLIC) {
      // MODE_HYPERBOLIC
      radius = pow(Vx * Vx + Vy * Vy + EPS.$, P.power / 2.0)
      theta = atan2(Vx, Vy)
      const pair = synthsincos(theta, P)
      s = pair.x
      c = pair.y
      newX = s / radius
      newY = c * radius
    } else if (mode === MODE_JULIA) {
      // MODE_JULIA
      radius = pow(Vx * Vx + Vy * Vy + EPS.$, P.power / 4.0)
      theta = atan2(Vx, Vy) / 2.0
      if (random() < 0.5) {
        theta += PI.$
      }
      const pair = synthsincos(theta, P)
      s = pair.x
      c = pair.y
      newX = radius * c
      newY = radius * s
    } else if (mode === MODE_DISC) {
      // MODE_DISC
      theta = atan2(Vx, Vy) / PI.$
      radius = PI.$ * pow(Vx * Vx + Vy * Vy + EPS.$, P.power / 2.0)
      const pair = synthsincos(radius, P)
      s = pair.x
      c = pair.y
      newX = s * theta
      newY = c * theta
    } else if (mode === MODE_RINGS) {
      // MODE_RINGS
      radius = sqrt(Vx * Vx + Vy * Vy)
      theta = atan2(Vx, Vy)
      const mu = P.power * P.power + EPS.$
      // Java: radius += -2.0 * mu * (int) ((radius + mu) / (2.0 * mu)) + radius * (1.0 - mu);
      // (int) is floor.
      const term = floor((radius + mu) / (2.0 * mu))
      radius = radius + -2.0 * mu * term + radius * (1.0 - mu)
      const pair = synthsincos(theta, P)
      s = pair.x
      c = pair.y
      newX = s * radius
      newY = c * radius
    } else if (mode === MODE_CYLINDER) {
      // MODE_CYLINDER
      radius = pow(Vx * Vx + Vy * Vy + EPS.$, P.power / 2.0)
      const pair = synthsincos(Vx, P)
      s = pair.x
      c = pair.y
      newX = radius * s
      newY = radius * Vy
    } else if (mode === MODE_XMIRROR) {
      // MODE_XMIRROR
      const mu = synthValue(Vx, P) - 1.0
      newY = 2.0 * mu - Vy
      newX = Vx
    } else if (mode === MODE_XYMIRROR) {
      // MODE_XYMIRROR
      const mu = synthValue(Vx, P) - 1.0
      radius = synthValue(Vy, P) - 1.0
      newY = 2.0 * mu - Vy
      newX = 2.0 * radius - Vx
    } else if (mode === MODE_SPHERICAL2) {
      // MODE_SPHERICAL2
      radius = length(pos)
      theta = atan2(Vx, Vy)
      theta_factor = synthValue(theta, P)
      radius = interpolate(radius, theta_factor, P.smoothFact)
      radius = pow(radius, P.power)
      s = sin(theta)
      c = cos(theta)
      newX = radius * s
      newY = radius * c
    }
    return vec2f(newX, newY)
  },
)
