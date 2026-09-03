import { calculateFlameStats } from '@/webmcp/tools/scoreFlame'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { SeatId } from '@/seats/seatId'

/**
 * How a duel is decided.
 *
 * One interface with one implementation, so that replacing "who won" is a
 * single file rather than a change to the stage, the tools and the card. The
 * clash mathematics brainstorm replaces `scoreSheetJudge`; nothing else on
 * the result card depends on how the decision is reached.
 */
export type DuelVerdict = {
  winner: SeatId | 'draw'
  /** One sentence for the result card, in the card's voice. */
  line: string
  playerScore: number
  rivalScore: number
}

export interface DuelJudge {
  judge(player: FlameDescriptor, rival: FlameDescriptor): DuelVerdict
}

/**
 * v0: the arena score sheet the app already computes — complexity, chaos,
 * symmetry and energy folded into one power level. Deliberately plain: it is
 * a placeholder that is honest about being one, not a scoring system anyone
 * argued for.
 */
export const scoreSheetJudge: DuelJudge = {
  judge(player, rival) {
    const playerScore = calculateFlameStats(player).powerLevel
    const rivalScore = calculateFlameStats(rival).powerLevel
    const winner: SeatId | 'draw' =
      playerScore === rivalScore
        ? 'draw'
        : playerScore > rivalScore
          ? 'player'
          : 'rival'
    const line =
      winner === 'draw'
        ? `Dead heat on the arena score sheet, ${playerScore} each.`
        : `Judged on the arena score sheet: ${playerScore} against ${rivalScore}.`
    return { winner, line, playerScore, rivalScore }
  },
}
