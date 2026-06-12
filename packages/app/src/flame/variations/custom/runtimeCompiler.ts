import { parse } from 'acorn'
import { transpileFn } from 'tinyest-for-wgsl'
import { tgpu } from 'typegpu'
import { vec2f } from 'typegpu/data'
import { VariationInfo } from '../simple/types'
import { BUILTIN_ARITY, BUILTIN_EXTERNALS } from './wgslBuiltins'
import type { TgpuFn } from 'typegpu'

const BANNED_NAMES = new Set([
  'storageBarrier',
  'textureBarrier',
  'workgroupBarrier',
  'atomicAdd',
  'atomicAnd',
  'atomicLoad',
  'atomicMax',
  'atomicMin',
  'atomicOr',
  'atomicStore',
  'atomicSub',
  'atomicXor',
  'textureSample',
  'textureLoad',
  'textureStore',
])

export type CompileError = {
  message: string
  line?: number // 0-indexed editor line, or undefined if unknown
}

export type CompileResult =
  | { valid: true; fn: TgpuFn; externalNames: string[] }
  | { valid: false; errors: CompileError[] }

function formatAcornError(err: unknown): { message: string; line?: number } {
  if (err instanceof SyntaxError) {
    const match = err.message.match(/\((\d+):(\d+)\)$/)
    if (match) {
      const acornLine = parseInt(match[1]!, 10)
      // Acorn line 1 = wrapper function, line 2+ = user code
      const editorLine = acornLine - 2
      const msg = err.message.replace(/\(\d+:\d+\)$/, '').trim()
      return { message: msg, line: editorLine >= 0 ? editorLine : undefined }
    }
    const msg = err.message.replace(/\(\d+:\d+\)$/, '').trim()
    return { message: msg }
  }
  return { message: err instanceof Error ? err.message : String(err) }
}

export function compileCustomVariationCode(wgslBody: string): CompileResult {
  const source = `(pos, varInfo) => {\n${wgslBody}\n}`

  let rootNode
  try {
    rootNode = parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    })
  } catch (err) {
    const acornErr = formatAcornError(err)
    return {
      valid: false,
      errors: [
        {
          message: `Parse error: ${acornErr.message}`,
          line: acornErr.line,
        },
      ],
    }
  }

  let irResult
  try {
    irResult = transpileFn(rootNode)
  } catch (err) {
    return {
      valid: false,
      errors: [
        {
          message: `Transpile error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    }
  }

  const { params, body, externalNames } = irResult

  const banned = externalNames.filter((name: string) => BANNED_NAMES.has(name))
  if (banned.length > 0) {
    return {
      valid: false,
      errors: [
        {
          message: `Banned features used: ${banned.join(', ')}. Storage, atomic, and texture operations are not allowed in custom variations.`,
        },
      ],
    }
  }

  const missingBuiltins = externalNames.filter(
    (name: string) => !(name in BUILTIN_EXTERNALS),
  )
  if (missingBuiltins.length > 0) {
    return {
      valid: false,
      errors: [
        {
          message: `Unknown identifiers: ${missingBuiltins.join(', ')}. Only built-in math functions (sin, cos, length, etc.), vec2f, f32, and constants (PI, EPS) are available.`,
        },
      ],
    }
  }

  const arityErrors: CompileError[] = []

  function walk(node: unknown) {
    if (!node || typeof node !== 'object') {
      return
    }

    const n = node as Record<string, unknown>
    if (n.type === 'CallExpression') {
      const callee = n.callee as Record<string, unknown> | undefined
      if (
        callee &&
        callee.type === 'Identifier' &&
        typeof callee.name === 'string'
      ) {
        const name = callee.name
        if (name in BUILTIN_ARITY) {
          const expected = BUILTIN_ARITY[name]!
          const args = n.arguments
          const actualCount = Array.isArray(args) ? args.length : 0

          let isValid = false
          if (Array.isArray(expected)) {
            isValid = expected.includes(actualCount)
          } else {
            isValid = actualCount === expected
          }

          if (!isValid) {
            let expectedStr = ''
            if (Array.isArray(expected)) {
              if (expected.length === 2) {
                expectedStr = `${expected[0]} or ${expected[1]}`
              } else if (expected.length > 2) {
                expectedStr = `${expected.slice(0, -1).join(', ')}, or ${expected[expected.length - 1]}`
              } else {
                expectedStr = expected.join(', ')
              }
            } else {
              expectedStr = String(expected)
            }

            const loc = n.loc as Record<string, unknown> | undefined
            const start = loc?.start as Record<string, unknown> | undefined
            const line =
              typeof start?.line === 'number' ? start.line : undefined

            arityErrors.push({
              message: `Function '${name}' expects ${expectedStr} arguments, but got ${actualCount}.`,
              line: line !== undefined ? line - 2 : undefined,
            })
          }
        }
      }
    }

    for (const key of Object.keys(n)) {
      if (key === 'loc') {
        continue
      }
      const child = n[key]
      if (Array.isArray(child)) {
        for (const item of child) {
          walk(item)
        }
      } else if (child && typeof child === 'object') {
        walk(child)
      }
    }
  }

  walk(rootNode)

  if (arityErrors.length > 0) {
    return {
      valid: false,
      errors: arityErrors,
    }
  }

  const dummyFn = () => {}
  const meta = (globalThis as Record<string, unknown>).__TYPEGPU_META__ as {
    set: (key: object, value: object) => void
  }
  meta.set(dummyFn, {
    externals: BUILTIN_EXTERNALS,
    ast: { params, body, externalNames },
  })

  try {
    const fn = tgpu.fn([vec2f, VariationInfo], vec2f)(dummyFn as never)
    return { valid: true, fn, externalNames }
  } catch (err) {
    return {
      valid: false,
      errors: [
        {
          message: `TypeGPU error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    }
  }
}
