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
export function processValibotErrors(
  flatErrors: ReturnType<typeof flatten>,
  errCallback: (err: string) => void,
) {
  const { root, nested, other } = flatErrors
  root?.forEach(errCallback)
  if (nested !== undefined) {
    Object.entries(nested).forEach(([key, value]) => {
      errCallback(
        `${key}: ${Array.isArray(value) ? value.join(' & ') : 'Unknown Issue'}`,
      )
    })
  }
  other?.forEach(errCallback)
}
