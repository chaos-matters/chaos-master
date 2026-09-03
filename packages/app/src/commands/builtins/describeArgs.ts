/**
 * Shared formatters for the `describe` hook.
 *
 * `describe` writes the one line a human reads for a step — in the Arcade's
 * live rail while the AI drives, and in the replay step list afterwards. Both
 * call it with the same normalized args, so a command that describes itself
 * reads identically in both places; one that does not falls back to its label
 * plus raw JSON.
 */

/** A number rounded for display, or undefined when the arg is not a number. */
export function num(value: unknown, digits = 2): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return String(Number(value.toFixed(digits)))
}

/** A non-empty string, or undefined. */
export function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}
