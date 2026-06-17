/** Format a remaining-time estimate (seconds) as e.g. "12s remaining" or
 *  "2m 5s remaining". Returns '' when the estimate is not meaningful. */
export function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return ''
  if (seconds < 60) return `${Math.ceil(seconds)}s remaining`
  const min = Math.floor(seconds / 60)
  const sec = Math.ceil(seconds % 60)
  return `${min}m ${sec}s remaining`
}
