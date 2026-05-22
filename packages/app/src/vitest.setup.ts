/**
 * Vitest test setup file.
 * Provides polyfills and test utilities.
 */

// Polyfill ResizeObserver which is not available in jsdom
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class ResizeObserver {
    constructor(private callback: ResizeObserverCallback) {
      // Just a minimal implementation
    }

    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
