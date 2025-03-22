export function recordKeys<T extends Record<string, unknown>>(
  record: T,
): (keyof T)[] {
  return Object.keys(record)
}
