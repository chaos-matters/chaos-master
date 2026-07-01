/** Format a remaining-time estimate (seconds) as e.g. "12s remaining" or
 *  "2m 5s remaining". Returns '' when the estimate is not meaningful. */
export function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return ''
  // Round once to a whole-second total first, then split into min/sec — rounding
  // each part separately could carry the seconds remainder up to "60s".
  const total = Math.ceil(seconds)
  if (total < 60) return `${total}s remaining`
  const min = Math.floor(total / 60)
  const sec = total % 60
  return `${min}m ${sec}s remaining`
}
