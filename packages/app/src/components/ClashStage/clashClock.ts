/**
 * The Flame Clash stage's own clock: wall seconds of the bout, advanced by
 * animation frames and never by more than a tenth of a second at once. A tab
 * left in the background gets no frames, so the bout pauses there and picks
 * up where it stopped instead of jumping to its end.
 */

/** The longest step one frame may take the clock. */
export const MAX_CLOCK_STEP = 0.1

export type ClashClock = {
  /** Seconds of the bout played. */
  elapsed: number
  /** The last frame's timestamp (ms), or undefined before the first. */
  last: number | undefined
}

export const CLOCK_AT_START: ClashClock = { elapsed: 0, last: undefined }

/**
 * The clock after a frame at `nowMs`, held at `limit`. The first frame only
 * starts it: there is no earlier frame to measure a step from.
 */
export function tickClock(
  clock: ClashClock,
  nowMs: number,
  limit = Number.POSITIVE_INFINITY,
): ClashClock {
  if (clock.last === undefined || !Number.isFinite(nowMs)) {
    return { elapsed: clock.elapsed, last: nowMs }
  }
  const step = Math.min(
    MAX_CLOCK_STEP,
    Math.max(0, (nowMs - clock.last) / 1000),
  )
  return { elapsed: Math.min(limit, clock.elapsed + step), last: nowMs }
}
