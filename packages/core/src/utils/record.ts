export function recordKeys<T extends Record<string, unknown>>(
  record: T,
): (keyof T)[] {
  return Object.keys(record)
}

export function recordEntries<T extends Record<string, unknown>>(
  record: T,
): [keyof T, T[keyof T]][] {
  return Object.entries(record) as [keyof T, T[keyof T]][]
}
