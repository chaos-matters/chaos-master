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
