import type { flatten } from '@/valibot'

export function prettyPrintValibotErrors(
  flatErrors: ReturnType<typeof flatten>,
) {
  const { root, nested, other } = flatErrors

  if (root !== undefined) {
    console.warn('Root issues: ')
    console.table(root)
  }
  if (nested !== undefined) {
    const nestedIssues = Object.fromEntries(
      Object.entries(nested).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.join(' & ') : 'Unknown Issue',
      ]),
    )
    console.warn('Schema issues: ')
    console.table(nestedIssues)
  }
  if (other !== undefined) {
    console.warn('Other issues: ')
    console.table(other)
  }
}
