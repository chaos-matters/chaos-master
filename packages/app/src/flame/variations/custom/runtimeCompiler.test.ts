import { describe, expect, it } from 'vitest'
import { compileCustomVariationCode } from './runtimeCompiler'

describe('compileCustomVariationCode - Arity Validation', () => {
  it('detects insufficient arguments for pow', () => {
    const code = 'return pow(5.0);'
    const result = compileCustomVariationCode(code)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors[0]?.message).toContain(
        "Function 'pow' expects 2 arguments, but got 1",
      )
      expect(result.errors[0]?.line).toBe(0)
    }
  })

  it('detects too many arguments for pow', () => {
    const code = 'return pow(5.0, 2.0, 3.0);'
    const result = compileCustomVariationCode(code)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors[0]?.message).toContain(
        "Function 'pow' expects 2 arguments, but got 3",
      )
    }
  })

  it('allows correct number of arguments for pow', () => {
    const code = 'return pow(5.0, 2.0);'
    const result = compileCustomVariationCode(code)
    // It might still fail on TypeGPU compilation in test environment if WebGPU is mock-only,
    // but it should not have our arity validation error.
    if (!result.valid) {
      const messages = result.errors.map((e) => e.message)
      const hasArityError = messages.some((m) => m.includes('expects'))
      expect(hasArityError).toBe(false)
    }
  })

  it('allows valid argument counts for vec2f', () => {
    const cases = [
      'return vec2f();',
      'return vec2f(1.0);',
      'return vec2f(1.0, 2.0);',
    ]

    for (const code of cases) {
      const result = compileCustomVariationCode(code)
      if (!result.valid) {
        const messages = result.errors.map((e) => e.message)
        const hasArityError = messages.some((m) => m.includes('expects'))
        expect(hasArityError).toBe(false)
      }
    }
  })

  it('detects invalid argument counts for vec2f', () => {
    const code = 'return vec2f(1.0, 2.0, 3.0);'
    const result = compileCustomVariationCode(code)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors[0]?.message).toContain(
        "Function 'vec2f' expects 0, 1, or 2 arguments, but got 3",
      )
    }
  })

  it('detects arity mismatch for clamp', () => {
    const code = 'return clamp(1.0, 2.0);'
    const result = compileCustomVariationCode(code)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors[0]?.message).toContain(
        "Function 'clamp' expects 3 arguments, but got 2",
      )
    }
  })
})

// S-6: untrusted source must only compile against the builtin allowlist. These
// guard the rejection paths, including the prototype-chain fix (inherited
// Object names like constructor/toString must not pass the `in`-based check).
describe('compileCustomVariationCode - allowlist rejections (S-6)', () => {
  it('rejects a syntax error', () => {
    expect(compileCustomVariationCode('this is !! not valid js').valid).toBe(
      false,
    )
  })

  it('rejects an identifier that is not a builtin', () => {
    expect(
      compileCustomVariationCode('return definitelyNotABuiltin(pos);').valid,
    ).toBe(false)
  })

  it('rejects inherited Object names (constructor / toString)', () => {
    expect(compileCustomVariationCode('return constructor;').valid).toBe(false)
    expect(compileCustomVariationCode('return toString(pos);').valid).toBe(
      false,
    )
  })
})
