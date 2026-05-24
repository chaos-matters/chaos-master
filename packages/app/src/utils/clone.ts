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
 * Deep clones data using `structuredClone`, while ensuring any SolidJS
 * reactivity proxies are unwrapped first.
 * We track properties before unwrapping to preserve reactivity.
 */
export function deepClone<T>(data: T): T {
  trackDeep(data)
  return structuredClone(unwrap(data))
}
