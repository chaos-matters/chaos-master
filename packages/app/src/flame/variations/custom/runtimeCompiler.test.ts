import { describe, expect, it } from 'vitest'
import { compileCustomVariationCode, MAX_CUSTOM_WGSL_LENGTH, } from './runtimeCompiler'

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

  it('rejects code exceeding the length cap', () => {
    const tooLong = `return pos; ${'/* pad */'.repeat(MAX_CUSTOM_WGSL_LENGTH)}`
    const result = compileCustomVariationCode(tooLong)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors[0]?.message).toContain('too long')
    }
  })
})

// Loops are allowed but must be provably bounded so untrusted variation code
// can't hang the GPU. Only statically-counted for-loops within the caps pass.
describe('compileCustomVariationCode - loop guard', () => {
  function loopError(code: string): string | undefined {
    const result = compileCustomVariationCode(code)
    if (result.valid) return undefined
    return result.errors.map((e) => e.message).join(' | ')
  }

  it('allows a counted for-loop within bounds', () => {
    const result = compileCustomVariationCode(
      'var p = pos;\nfor (let i = 0; i < 4; i++) { p = p + pos; }\nreturn p;',
    )
    // Might still fail at the TypeGPU stage in the test env, but never with a
    // loop-guard error.
    if (!result.valid) {
      const messages = result.errors.map((e) => e.message).join(' | ')
      expect(messages).not.toMatch(/loop|bounded|nested|too many times/i)
    }
  })

  it('rejects while loops', () => {
    expect(loopError('while (true) { }\nreturn pos;')).toMatch(/while/i)
  })

  it('rejects do-while loops', () => {
    expect(loopError('do { } while (true)\nreturn pos;')).toMatch(/while/i)
  })

  it('rejects an unbounded for-loop', () => {
    expect(loopError('for (;;) { }\nreturn pos;')).toMatch(
      /statically bounded/i,
    )
  })

  it('rejects a for-loop without a literal bound', () => {
    // PI is an allowed constant, so this passes the allowlist and reaches the
    // loop guard — but the bound isn't a literal, so it can't be sized.
    expect(loopError('for (let i = 0; i < PI; i++) { }\nreturn pos;')).toMatch(
      /statically bounded/i,
    )
  })

  it('rejects a loop with too many iterations', () => {
    expect(
      loopError('for (let i = 0; i < 100000; i++) { }\nreturn pos;'),
    ).toMatch(/too many times/i)
  })

  it('rejects loops nested too deeply', () => {
    const code = `for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) {
        for (let c = 0; c < 2; c++) {
          for (let d = 0; d < 2; d++) { }
        }
      }
    }
    return pos;`
    expect(loopError(code)).toMatch(/nested too deep/i)
  })

  it('rejects nested loops whose combined iterations exceed the cap', () => {
    const code = `for (let a = 0; a < 100; a++) {
      for (let b = 0; b < 100; b++) { }
    }
    return pos;`
    expect(loopError(code)).toMatch(/combined/i)
  })
})
