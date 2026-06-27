/**
 * Integration tests for App component.
 *
 * These tests verify that the application components can be constructed
 * without throwing errors.
 */
import { createRoot } from 'solid-js'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, } from 'vitest'
import { Wrappers } from './App'

describe('App Component Integration', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeAll(() => {
    // These tests assert that the app tree CONSTRUCTS without throwing (the
    // synchronous expect(...).not.toThrow() below). Construction also starts
    // async work that — under happy-dom with no WebGPU — renders the degraded
    // (poster) shell and logs expected errors after the test ends: WebGPU is
    // absent, and APIs the full shell touches (e.g. IndexedDB) aren't
    // implemented in the test DOM. Silence console.error so that expected noise
    // doesn't surface as an unhandled error; genuine construction failures still
    // fail the synchronous assertion above.
    //
    // (The previous implementation called `consoleErrorSpy.mock.restore()`,
    // which isn't a function — it threw an unhandled rejection the moment any
    // non-WebGPU error was logged, e.g. the degraded shell's IndexedDB gap.)
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterAll(() => {
    consoleErrorSpy.mockRestore()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not throw when creating component root', () => {
    expect(() => {
      createRoot(() => {
        Wrappers()
      })
    }).not.toThrow()
  })

  it('should handle repeated root creations without errors', () => {
    let renders = 0
    const maxRenders = 10

    for (let i = 0; i < maxRenders; i++) {
      createRoot((dispose) => {
        Wrappers()
        dispose()
      })
      renders++
    }

    expect(renders).toBe(maxRenders)
  })

  it('should not throw on rapid repeated disposal', () => {
    for (let i = 0; i < 5; i++) {
      createRoot((dispose) => {
        Wrappers()
        dispose()
      })
    }
  })
})
