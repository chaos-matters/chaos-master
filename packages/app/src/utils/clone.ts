import { unwrap } from 'solid-js/store'

/**
 * Recursively reads properties to ensure SolidJS tracks them as dependencies.
 */
function trackDeep(obj: unknown, visited = new Set<unknown>()) {
  if (
    obj !== null &&
    obj !== undefined &&
    typeof obj === 'object' &&
    !visited.has(obj)
  ) {
    visited.add(obj)
    for (const key in obj) {
      trackDeep((obj as Record<string, unknown>)[key], visited)
    }
  }
}

/**
 * Deep clones data using JSON round-trip, while ensuring any SolidJS
 * reactivity proxies are unwrapped first.
 * We track properties before unwrapping to preserve reactivity.
 *
 * Uses JSON.parse(JSON.stringify()) instead of structuredClone because
 * structuredClone throws DataCloneError on iOS Safari and some other browsers.
 */
export function deepClone<T>(data: T): T {
  trackDeep(data)
  return JSON.parse(JSON.stringify(unwrap(data)))
}
