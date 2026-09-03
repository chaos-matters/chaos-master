import { DEFAULT_SEAT } from '@/seats/seatId'
import type { DuelVerdict } from './duelJudge'
import type { SeatId } from '@/seats/seatId'

/**
 * Everything a duel HUD draws, derived once.
 *
 * The HUD has more than one look — the eclipse dial ships first, the arcade
 * bar is a toggle we want to add later — and none of them should be allowed to
 * compute the numbers themselves, or two HUDs would disagree about who is
 * winning. So the arithmetic lives here and each variant is a pure component
 * over this shape.
 */
export type DuelHudModel = {
  remainingMs: number
  /** m:ss, the only place the clock is formatted. */
  clock: string
  durationMs: number
  /** 0 at the start, 1 when the clock runs out. */
  elapsed: number
  /** True for the last ten seconds, so a variant can lean on it. */
  urgent: boolean
  playerScore: number
  rivalScore: number
  /** Each side's share of the ring, together summing to 1. */
  playerShare: number
  rivalShare: number
  leader: DuelVerdict['winner']
  /** The title the agent gave when it declared itself happy, if it has. */
  readyTitle?: string
  ready: boolean
}

/**
 * The smallest share a side can render at.
 *
 * A flame scoring nothing still has a seat in the duel, and a bare ring with
 * one colour reads as "broken" rather than "losing badly" — so the loser keeps
 * a visible sliver.
 */
export const MIN_HUD_SHARE = 0.06

export function formatDuelClock(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * Two scores into two shares of one ring.
 *
 * A tug-of-war, not a pair of gauges: `powerLevel` has no maximum, so there is
 * nothing to fill a bar *against*. What is meaningful is the ratio — being
 * ahead means owning more of the ring — and that is stable however large the
 * scores get.
 */
export function duelShares(
  playerScore: number,
  rivalScore: number,
): { playerShare: number; rivalShare: number } {
  const total = playerScore + rivalScore
  const raw = total > 0 ? playerScore / total : 0.5
  const playerShare = Math.min(1 - MIN_HUD_SHARE, Math.max(MIN_HUD_SHARE, raw))
  return { playerShare, rivalShare: 1 - playerShare }
}

export function duelHudModel(input: {
  remainingMs: number
  durationMs: number
  verdict?: DuelVerdict
  readyTitle?: string
}): DuelHudModel {
  const playerScore = input.verdict?.playerScore ?? 0
  const rivalScore = input.verdict?.rivalScore ?? 0
  const { playerShare, rivalShare } = duelShares(playerScore, rivalScore)
  const remainingMs = Math.max(0, input.remainingMs)
  return {
    remainingMs,
    clock: formatDuelClock(remainingMs),
    durationMs: input.durationMs,
    elapsed:
      input.durationMs > 0
        ? Math.min(1, 1 - remainingMs / input.durationMs)
        : 1,
    urgent: remainingMs <= 10_000,
    playerScore,
    rivalScore,
    playerShare,
    rivalShare,
    leader: input.verdict?.winner ?? 'draw',
    readyTitle: input.readyTitle,
    ready: input.readyTitle !== undefined,
  }
}

/** Which half of the split screen a seat draws on. */
export function seatSide(seatId: SeatId): 'left' | 'right' {
  return seatId === DEFAULT_SEAT ? 'left' : 'right'
}
