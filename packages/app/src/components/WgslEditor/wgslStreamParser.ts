import { StreamLanguage } from '@codemirror/language'
import type { StringStream } from '@codemirror/language'

const WGSL_KEYWORDS = new Set([
  'let',
  'var',
  'return',
  'if',
  'else',
  'for',
  'while',
  'fn',
  'struct',
  'select',
  'switch',
  'case',
  'default',
  'break',
  'continue',
  'const',
  'discard',
  'loop',
  'continuing',
])

const WGSL_TYPES = new Set([
  'vec2f',
  'vec3f',
  'vec4f',
  'vec2i',
  'vec3i',
  'vec4i',
  'vec2u',
  'vec3u',
  'vec4u',
  'f32',
  'i32',
  'u32',
  'bool',
  'mat2x2f',
  'mat2x3f',
  'mat2x4f',
  'mat3x2f',
  'mat3x3f',
  'mat3x4f',
  'mat4x2f',
  'mat4x3f',
  'mat4x4f',
  'array',
  'ptr',
  'texture_1d',
  'texture_2d',
  'texture_3d',
  'texture_cube',
  'sampler',
  'Sampler',
  'atomic',
])

const WGSL_BUILTINS = new Set([
  'abs',
  'acos',
  'acosh',
  'asin',
  'asinh',
  'atan',
  'atanh',
  'atan2',
  'ceil',
  'clamp',
  'cos',
  'cosh',
  'cross',
  'degrees',
  'determinant',
  'distance',
  'dot',
  'exp',
  'exp2',
  'faceForward',
  'floor',
  'fma',
  'fract',
  'frexp',
  'inverseSqrt',
  'ldexp',
  'length',
  'log',
  'log2',
  'max',
  'min',
  'mix',
  'modf',
  'normalize',
  'pow',
  'quantizeToF16',
  'radians',
  'reflect',
  'refract',
  'round',
  'sign',
  'sin',
  'sinh',
  'saturate',
  'smoothstep',
  'sqrt',
  'step',
  'tan',
  'tanh',
  'transpose',
  'trunc',
  'dpdx',
  'dpdy',
  'fwidth',
  'pack4x8snorm',
  'pack4x8unorm',
  'pack2x16snorm',
  'pack2x16unorm',
  'pack2x16float',
  'unpack4x8snorm',
  'unpack4x8unorm',
  'unpack2x16snorm',
  'unpack2x16unorm',
  'unpack2x16float',
  'all',
  'any',
  'countLeadingZeros',
  'countOneBits',
  'countTrailingZeros',
  'extractBits',
  'firstLeadingBit',
  'firstTrailingBit',
  'insertBits',
  'reverseBits',
  'mod',
  'floorMod',
])

function readLineComment(stream: StringStream): string | null {
  if (stream.match(/\/\/.*/)) return 'comment'
  return null
}

function readString(stream: StringStream): string | null {
  if (stream.match(/"[^"]*"/)) return 'string'
  return null
}

function readNumber(stream: StringStream): string | null {
  if (stream.match(/0[xX][\da-fA-F]+[u]?/)) return 'number'
  if (stream.match(/\d+\.?\d*(?:[eE][+-]?\d+)?[fiu]?/)) return 'number'
  return null
}

function readIdent(stream: StringStream): string | null {
  const match = stream.match(/[a-zA-Z_]\w*/)
  if (match === null || typeof match === 'boolean') return null
  const word = match[0]
  if (WGSL_KEYWORDS.has(word)) return 'keyword'
  if (WGSL_TYPES.has(word)) return 'type'
  if (WGSL_BUILTINS.has(word)) return 'builtin'
  return 'variableName'
}

const WGSL_PARSER = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null
    if (stream.sol() && stream.peek() === '/' && stream.peek() !== undefined) {
      const next = stream.string[stream.pos + 1]
      if (next === '/') return readLineComment(stream)
    }
    if (stream.peek() === '"') return readString(stream)
    const num = readNumber(stream)
    if (num) return num
    const ident = readIdent(stream)
    if (ident) return ident
    // Punctuation / operators
    stream.next()
    return null
  },
  languageData: {
    commentTokens: { line: '//' },
  },
})

export function wgsl() {
  return WGSL_PARSER
}
