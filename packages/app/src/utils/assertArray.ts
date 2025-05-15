/**
 * Type guard to make sure an array has at least one element,
 * so it can be indexed into using `[0]` or unpacked like:
 * ```
 * let array: number[]
 * if (hasAtLeastOneElement(array)) {
 *   const [first, ...rest] = array
 *   // first is number, not number | undefined
 * }
 * ```
 */
export function hasAtLeastOneElement<T>(array: T[]): array is [T, ...T[]] {
  return array.length > 0
}
/**
 * Type guard to make sure an array has exactly one element,
 * so it can be indexed into using `[0]` or unpacked like:
 * ```
 * let array: number[]
 * if (hasExactlyOneElement(array)) {
 *   const [first] = array
 *   // first is number, not number | undefined
 * }
 * ```
 */
export function hasExactlyOneElement<T>(array: T[]): array is [T] {
  return array.length > 0
}
