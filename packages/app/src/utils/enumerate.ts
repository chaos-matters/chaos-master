export function* enumerate<T>(items: Iterable<T>) {
  let i = 0
  for (const item of items) {
    yield [i++, item] as const
  }
}
