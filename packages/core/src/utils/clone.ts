/**
 * Pure deep cloning for non-reactive data objects.
 * Uses JSON round-trip for universal browser and node compatibility without DOM/Solid dependencies.
 */
export function pureClone<T>(data: T): T {
  if (data === null || typeof data !== 'object') {
    return data
  }
  return JSON.parse(JSON.stringify(data))
}
