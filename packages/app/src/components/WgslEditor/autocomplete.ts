import type { Completion, CompletionSource } from '@codemirror/autocomplete'

const BUILTINS: Completion[] = [
  // Types
  { label: 'f32', type: 'type', detail: 'scalar' },
  { label: 'vec2f', type: 'type', detail: 'vector' },

  // Constants
  { label: 'PI', type: 'constant', detail: '3.14159265' },
  { label: 'EPS', type: 'constant', detail: '0.000001' },
  { label: 'EPS_TINY', type: 'constant', detail: '1e-10' },

  // Parameters
  { label: 'pos', type: 'variable', detail: 'vec2f — input point' },
  {
    label: 'varInfo',
    type: 'variable',
    detail: 'VariationInfo — has .weight (f32)',
  },

  // Trig
  { label: 'sin', type: 'function', detail: 'sin(x: f32) → f32' },
  { label: 'cos', type: 'function', detail: 'cos(x: f32) → f32' },
  { label: 'tan', type: 'function', detail: 'tan(x: f32) → f32' },
  { label: 'asin', type: 'function', detail: 'asin(x: f32) → f32' },
  { label: 'acos', type: 'function', detail: 'acos(x: f32) → f32' },
  { label: 'atan', type: 'function', detail: 'atan(x: f32) → f32' },
  { label: 'atan2', type: 'function', detail: 'atan2(y: f32, x: f32) → f32' },
  { label: 'sinh', type: 'function', detail: 'sinh(x: f32) → f32' },
  { label: 'cosh', type: 'function', detail: 'cosh(x: f32) → f32' },
  { label: 'tanh', type: 'function', detail: 'tanh(x: f32) → f32' },

  // Math
  { label: 'abs', type: 'function', detail: 'abs(x: f32) → f32' },
  { label: 'sqrt', type: 'function', detail: 'sqrt(x: f32) → f32' },
  {
    label: 'inverseSqrt',
    type: 'function',
    detail: 'inverseSqrt(x: f32) → f32',
  },
  { label: 'exp', type: 'function', detail: 'exp(x: f32) → f32' },
  { label: 'exp2', type: 'function', detail: 'exp2(x: f32) → f32' },
  { label: 'log', type: 'function', detail: 'log(x: f32) → f32 (natural log)' },
  { label: 'log2', type: 'function', detail: 'log2(x: f32) → f32' },
  { label: 'pow', type: 'function', detail: 'pow(base: f32, exp: f32) → f32' },
  { label: 'degrees', type: 'function', detail: 'degrees(rad: f32) → f32' },
  { label: 'radians', type: 'function', detail: 'radians(deg: f32) → f32' },

  // Vector
  { label: 'length', type: 'function', detail: 'length(v: vec2f) → f32' },
  {
    label: 'distance',
    type: 'function',
    detail: 'distance(a: vec2f, b: vec2f) → f32',
  },
  { label: 'dot', type: 'function', detail: 'dot(a: vec2f, b: vec2f) → f32' },
  {
    label: 'cross',
    type: 'function',
    detail: 'cross(a: vec2f, b: vec2f) → f32',
  },
  {
    label: 'normalize',
    type: 'function',
    detail: 'normalize(v: vec2f) → vec2f',
  },

  // Interpolation
  { label: 'mix', type: 'function', detail: 'mix(a: T, b: T, t: f32) → T' },
  {
    label: 'smoothstep',
    type: 'function',
    detail: 'smoothstep(edge0: f32, edge1: f32, x: f32) → f32',
  },
  { label: 'step', type: 'function', detail: 'step(edge: f32, x: f32) → f32' },

  // Rounding
  { label: 'ceil', type: 'function', detail: 'ceil(x: f32) → f32' },
  { label: 'floor', type: 'function', detail: 'floor(x: f32) → f32' },
  { label: 'round', type: 'function', detail: 'round(x: f32) → f32' },
  { label: 'trunc', type: 'function', detail: 'trunc(x: f32) → f32' },
  { label: 'fract', type: 'function', detail: 'fract(x: f32) → f32' },
  { label: 'sign', type: 'function', detail: 'sign(x: f32) → f32' },

  // Comparison
  {
    label: 'clamp',
    type: 'function',
    detail: 'clamp(x: f32, lo: f32, hi: f32) → f32',
  },
  { label: 'min', type: 'function', detail: 'min(a: T, b: T) → T' },
  { label: 'max', type: 'function', detail: 'max(a: T, b: T) → T' },
  {
    label: 'select',
    type: 'function',
    detail: 'select(false: T, true: T, cond: bool) → T',
  },
]

export const wgslCompletions: CompletionSource = (context) => {
  const word = context.matchBefore(/\w*/)
  if (!word || (word.from === word.to && !context.explicit)) return null

  return {
    from: word.from,
    options: BUILTINS,
    validFor: /^\w*$/,
  }
}
