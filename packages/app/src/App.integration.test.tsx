/**
 * Integration tests for App component.
 *
 * These tests verify that the application components can be constructed
 * without throwing errors.
 */
import { createRoot } from 'solid-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Wrappers } from './App'

describe('App Component Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not throw when creating component root', () => {
    const originalError = console.error
    const errorMessages: string[] = []

    console.error = (...args: unknown[]) => {
      errorMessages.push(args.map((arg) => String(arg)).join(' '))
    }

    try {
      expect(() => {
        createRoot(() => {
          Wrappers()
        })
      }).not.toThrow()
    } finally {
      console.error = originalError
    }
  })

  it('should handle repeated root creations without errors', () => {
    const originalError = console.error
    const errorMessages: string[] = []

    console.error = (...args: unknown[]) => {
      errorMessages.push(args.map((arg) => String(arg)).join(' '))
    }

    let renders = 0
    const maxRenders = 10

    try {
      for (let i = 0; i < maxRenders; i++) {
        createRoot((dispose) => {
          Wrappers()
          dispose()
        })
        renders++
      }
    } finally {
      console.error = originalError
    }

    expect(renders).toBe(maxRenders)
    expect(errorMessages).toEqual([])
  })

  it('should not throw on rapid repeated disposal', () => {
    const originalError = console.error
    const errorMessages: string[] = []

    console.error = (...args: unknown[]) => {
      errorMessages.push(args.map((arg) => String(arg)).join(' '))
    }

    try {
      for (let i = 0; i < 5; i++) {
        createRoot((dispose) => {
          Wrappers()
          dispose()
        })
      }
    } finally {
      console.error = originalError
    }

    expect(errorMessages).toEqual([])
  })
})
