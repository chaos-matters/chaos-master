import { describe, expect, it, vi } from 'vitest'
import { createExplorerFailure } from './explorerFailure'

const SHADER =
  "the browser could not build the explorer's shaders: 1 error generated while compiling the shader:\n12:3: offset of struct member IterateUniforms::orbit0 must be a multiple of 16 bytes, but its offset is 36 bytes"

/** A failure record whose pipeline check settles when the test says so. */
function setup() {
  const log = vi.fn<(message: string) => void>()
  let settle: (complaint: string | undefined) => void = () => undefined
  let refuse: (cause: unknown) => void = () => undefined
  const pipelines = new Promise<string | undefined>((resolve, reject) => {
    settle = resolve
    refuse = reject
  })
  const failure = createExplorerFailure(pipelines, log)
  return { failure, log, settle, refuse }
}

describe('createExplorerFailure', () => {
  it('says nothing while the picture runs', async () => {
    const { failure, log, settle } = setup()
    settle(undefined)
    await Promise.resolve()
    expect(failure.message()).toBeUndefined()
    expect(failure.stopped()).toBe(false)
    expect(log).not.toHaveBeenCalled()
  })

  it('keeps the latest failure, logs each new one once, and forgets it when cleared', () => {
    const { failure, log } = setup()
    failure.fail(new Error('the orbit worker failed to start'))
    failure.fail(new Error('the orbit worker failed to start'))
    expect(failure.message()).toBe('the orbit worker failed to start')
    expect(log.mock.calls).toEqual([['the orbit worker failed to start']])
    failure.fail('the GPU refused the orbits: out of memory')
    expect(failure.message()).toBe('the GPU refused the orbits: out of memory')
    expect(log).toHaveBeenCalledTimes(2)
    failure.clear()
    expect(failure.message()).toBeUndefined()
    expect(failure.stopped()).toBe(false)
  })

  it('names the compiler error when the shaders do not build, and stops for good', async () => {
    const { failure, log, settle } = setup()
    failure.fail(new Error('Invalid ComputePipeline'))
    settle(
      '1 error generated while compiling the shader:\n12:3: offset of struct member IterateUniforms::orbit0 must be a multiple of 16 bytes, but its offset is 36 bytes',
    )
    await Promise.resolve()
    expect(failure.message()).toBe(SHADER)
    expect(failure.stopped()).toBe(true)
    // A new reference does not bring the shaders back, nor does a later step.
    failure.clear()
    failure.fail(new Error('Invalid CommandBuffer'))
    expect(failure.message()).toBe(SHADER)
    expect(log.mock.calls).toEqual([
      ['Invalid ComputePipeline'],
      [SHADER],
      ['Invalid CommandBuffer'],
    ])
  })

  it('takes a rejected check as shaders that did not build', async () => {
    const { failure, refuse } = setup()
    refuse(new Error('popErrorScope: the stack is empty'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(failure.stopped()).toBe(true)
    expect(failure.message()).toBe(
      "the browser could not build the explorer's shaders: popErrorScope: the stack is empty",
    )
  })
})
