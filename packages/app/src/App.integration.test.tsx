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
    // Spy on console.error to silence expected WebGPU initialization errors
    // that happen asynchronously after the test completes.
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation((...args) => {
        const msg = args.map((arg) => String(arg)).join(' ')
        // Only log errors that are NOT expected WebGPU errors
        if (!msg.includes('WebGPU')) {
          consoleErrorSpy.mock.restore()
          console.error(...args)
          consoleErrorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {})
        }
      })
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
