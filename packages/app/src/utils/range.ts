export function range(n: number) {
  const result = new Array<number>(n)
  for (let i = 0; i < n; ++i) {
    result[i] = i
  }
  return result
}
