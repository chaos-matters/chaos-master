export function sum(nums: Iterable<number>): number {
  let s = 0
  for (const n of nums) {
    s += n
  }
  return s
}
