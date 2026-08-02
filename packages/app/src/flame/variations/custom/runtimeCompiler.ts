import { parse } from 'acorn'
import { transpileFn } from 'tinyest-for-wgsl'
import { tgpu } from 'typegpu'
import { vec2f } from 'typegpu/data'
import { VariationInfo } from '../simple/types'
import { BUILTIN_ARITY, BUILTIN_EXTERNALS } from './wgslBuiltins'
import type { TgpuFn } from 'typegpu'

/**
 * Hard cap on custom-variation source length. Bounds parse/compile cost for
 * untrusted code (e.g. a variation arriving inside a shared link) and keeps the
 * share payload small. Generous for any hand-written variation; 16 KB of WGSL
 * is far more than a single `(pos, varInfo) => vec2f` function needs.
 */
export const MAX_CUSTOM_WGSL_LENGTH = 16384

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

// ── Loop guard ───────────────────────────────────────────────────────────────
// Custom-variation code runs per point, millions of times per frame, on the GPU
// with no preemption: an unbounded or huge loop hangs the whole device. So loops
// are allowed but must be provably bounded. Only counted `for` loops with a
// statically-known trip count are accepted; `while`/`do-while` and dynamic-bound
// `for` loops (which can't be bounded at compile time) are rejected with a hint.
// The trip count, nesting depth, and combined (multiplied) iteration count along
// any nesting path are all capped. This applies to every custom variation
// (locally authored or arriving in a shared link), since a hang is a hang
// regardless of source.

/** Max iterations of a single loop. */
export const MAX_LOOP_ITERATIONS = 1024
/** Max loop nesting depth. */
export const MAX_LOOP_DEPTH = 3
/** Max number of loops in one variation. */
export const MAX_LOOP_COUNT = 16
/** Max product of trip counts along any nested-loop path (worst-case work). */
export const MAX_TOTAL_LOOP_ITERATIONS = 4096

const LOOP_TYPES = new Set([
  'ForStatement',
  'WhileStatement',
  'DoWhileStatement',
  'ForInStatement',
  'ForOfStatement',
])

const COUNTED_FOR_HINT =
  'Use a counted for-loop with a fixed numeric bound, e.g. for (let i = 0; i < 8; i++).'

type AstNode = Record<string, unknown>

function asNode(value: unknown): AstNode | undefined {
  return value && typeof value === 'object' ? (value as AstNode) : undefined
}

/** Numeric value of a literal node, including `-1`; undefined if not a constant. */
function literalNumber(value: unknown): number | undefined {
  const node = asNode(value)
  if (!node) return undefined
  if (node.type === 'Literal' && typeof node.value === 'number') {
    return node.value
  }
  if (node.type === 'UnaryExpression' && node.operator === '-') {
    const inner = literalNumber(node.argument)
    return inner === undefined ? undefined : -inner
  }
  return undefined
}

/**
 * Static trip count of a canonical counted `for` loop:
 * `for (let i = <lit>; i </<= <lit>; i++ | i += <lit> | i = i + <lit>)`.
 * Returns undefined when the loop isn't statically bounded (so it's rejected).
 */
function forTripCount(node: AstNode): number | undefined {
  const init = asNode(node.init)
  const test = asNode(node.test)
  const update = asNode(node.update)
  if (!init || !test || !update) return undefined

  let varName: string | undefined
  let start: number | undefined
  if (init.type === 'VariableDeclaration') {
    const decls = init.declarations
    if (!Array.isArray(decls) || decls.length !== 1) return undefined
    const decl = asNode(decls[0])
    const id = asNode(decl?.id)
    if (id?.type !== 'Identifier') return undefined
    varName = id.name as string
    start = literalNumber(decl?.init)
  } else if (init.type === 'AssignmentExpression' && init.operator === '=') {
    const left = asNode(init.left)
    if (left?.type !== 'Identifier') return undefined
    varName = left.name as string
    start = literalNumber(init.right)
  } else {
    return undefined
  }
  if (varName === undefined || start === undefined) return undefined

  if (test.type !== 'BinaryExpression') return undefined
  const testLeft = asNode(test.left)
  if (testLeft?.type !== 'Identifier' || testLeft.name !== varName) {
    return undefined
  }
  const end = literalNumber(test.right)
  if (end === undefined) return undefined
  if (test.operator !== '<' && test.operator !== '<=') return undefined

  let step: number | undefined
  if (update.type === 'UpdateExpression' && update.operator === '++') {
    if (asNode(update.argument)?.name === varName) step = 1
  } else if (update.type === 'AssignmentExpression') {
    if (asNode(update.left)?.name === varName) {
      if (update.operator === '+=') {
        step = literalNumber(update.right)
      } else if (update.operator === '=') {
        const right = asNode(update.right)
        if (right?.type === 'BinaryExpression' && right.operator === '+') {
          const rl = asNode(right.left)
          const rr = asNode(right.right)
          if (rl?.name === varName) step = literalNumber(right.right)
          else if (rr?.name === varName) step = literalNumber(right.left)
        }
      }
    }
  }
  if (step === undefined || step <= 0) return undefined

  if (end <= start) return 0
  const span = test.operator === '<=' ? end - start + 1 : end - start
  return Math.ceil(span / step)
}

function editorLine(node: AstNode): number | undefined {
  const start = asNode(asNode(node.loc)?.start)
  // Acorn line 1 = wrapper function, line 2+ = user code (see formatAcornError).
  return typeof start?.line === 'number' ? start.line - 2 : undefined
}

/** Reject unbounded / oversized / over-nested loops. Empty array = OK. */
function checkLoops(root: unknown): CompileError[] {
  const errors: CompileError[] = []
  let loopCount = 0

  function visit(value: unknown, depth: number, product: number) {
    const node = asNode(value)
    if (!node) return
    let nextDepth = depth
    let nextProduct = product

    if (typeof node.type === 'string' && LOOP_TYPES.has(node.type)) {
      loopCount++
      const line = editorLine(node)
      nextDepth = depth + 1

      if (loopCount > MAX_LOOP_COUNT) {
        errors.push({
          message: `Too many loops (max ${MAX_LOOP_COUNT} per variation).`,
          line,
        })
      }
      if (nextDepth > MAX_LOOP_DEPTH) {
        errors.push({
          message: `Loops nested too deeply (max depth ${MAX_LOOP_DEPTH}).`,
          line,
        })
      }

      if (node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
        errors.push({
          message: `for-in / for-of loops aren't allowed. ${COUNTED_FOR_HINT}`,
          line,
        })
      } else if (
        node.type === 'WhileStatement' ||
        node.type === 'DoWhileStatement'
      ) {
        errors.push({
          message: `while / do-while loops aren't allowed because they can't be bounded at compile time. ${COUNTED_FOR_HINT}`,
          line,
        })
      } else {
        const trips = forTripCount(node)
        if (trips === undefined) {
          errors.push({
            message: `Loop isn't statically bounded. ${COUNTED_FOR_HINT}`,
            line,
          })
        } else if (trips > MAX_LOOP_ITERATIONS) {
          errors.push({
            message: `Loop runs too many times (${trips}; max ${MAX_LOOP_ITERATIONS}).`,
            line,
          })
        } else {
          nextProduct = product * Math.max(trips, 1)
          if (nextProduct > MAX_TOTAL_LOOP_ITERATIONS) {
            errors.push({
              message: `Nested loops run too many times combined (${nextProduct}; max ${MAX_TOTAL_LOOP_ITERATIONS}).`,
              line,
            })
          }
        }
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'loc') continue
      const child = node[key]
      if (Array.isArray(child)) {
        for (const item of child) visit(item, nextDepth, nextProduct)
      } else if (child && typeof child === 'object') {
        visit(child, nextDepth, nextProduct)
      }
    }
  }

  visit(root, 0, 1)
  return errors
}

export function compileCustomVariationCode(wgslBody: string): CompileResult {
  if (wgslBody.length > MAX_CUSTOM_WGSL_LENGTH) {
    return {
      valid: false,
      errors: [
        {
          message: `Code is too long (${wgslBody.length} characters). The maximum is ${MAX_CUSTOM_WGSL_LENGTH}.`,
        },
      ],
    }
  }

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

  // Guard loops before transpiling: gives a clear loop-specific error and stops
  // an unbounded/huge loop from ever reaching the GPU.
  const loopErrors = checkLoops(rootNode)
  if (loopErrors.length > 0) {
    return { valid: false, errors: loopErrors }
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

  // BUILTIN_EXTERNALS is the security allowlist for untrusted custom-variation
  // code: reject any identifier not explicitly in it, so unknown/dangerous
  // externals never compile. Use Object.hasOwn, not `in` — `in` walks the
  // prototype chain, which would let inherited Object names (constructor,
  // toString, valueOf, hasOwnProperty, …) slip past the allowlist. BANNED_NAMES
  // above is a clearer-error denylist on top; its entries aren't in
  // BUILTIN_EXTERNALS, so they're already rejected here. (Compiled output is
  // sandboxed WGSL on the GPU, not JS.)
  const missingBuiltins = externalNames.filter(
    (name: string) => !Object.hasOwn(BUILTIN_EXTERNALS, name),
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
        if (Object.hasOwn(BUILTIN_ARITY, name)) {
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
    // TypeGPU 0.11+ rejects unversioned metadata. Keep this in lockstep with
    // unplugin-typegpu's METADATA_FORMAT_VERSION for the v1 AST shape emitted
    // by tinyest-for-wgsl.
    v: 1,
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
