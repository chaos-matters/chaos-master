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
/**
 * One scored component, both sides, with the arithmetic that produced it.
 *
 * Carried on the verdict rather than recomputed by the card: a result screen
 * that explains a score it derived separately is a second implementation of
 * the judge, and the two drift.
 */
export type DuelComponent = {
  key: 'complexity' | 'chaos' | 'symmetry' | 'energy'
  label: string
  /** What the component measures, in one sentence, for the info panel. */
  detail: string
  /** 0-10 each. */
  player: number
  rival: number
  /** Points per unit, so `player * weight` is what it contributed. */
  weight: number
}

export type DuelVerdict = {
  winner: SeatId | 'draw'
  /** One sentence for the result card, in the card's voice. */
  line: string
  playerScore: number
  rivalScore: number
  /** Empty for judges that do not break their score down. */
  components: readonly DuelComponent[]
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
    return { winner, line, playerScore, rivalScore, components: [] }
  },
}

/**
 * Saturating rather than capped.
 *
 * `min(10, k * raw)` stops counting the moment you pass the cap, and the caps
 * are low: chaos reaches its at a non-linear weight sum of 6.67 and symmetry
 * at 4, both of which an ordinary flame passes in a couple of edits. Past
 * that, work does not count and two different flames tie.
 *
 * `10 * raw / (raw + half)` never caps, always rewards more and has
 * diminishing returns, so the ring keeps moving all the way to the buzzer.
 * `half` is the raw value that scores 5.
 */
function saturate(raw: number, half: number): number {
  return (10 * raw) / (raw + half)
}

const COMPONENTS = [
  {
    key: 'complexity',
    label: 'Complexity',
    detail: 'How many transforms and variations the flame is built from.',
    half: 4,
    weight: 22,
  },
  {
    key: 'chaos',
    label: 'Chaos',
    detail: 'How much weight sits on non-linear variations.',
    half: 5,
    weight: 28,
  },
  {
    key: 'symmetry',
    label: 'Symmetry',
    detail: 'Weight on variations that fold the plane back onto itself.',
    half: 1.5,
    weight: 25,
  },
  {
    key: 'energy',
    label: 'Energy',
    detail: 'Exposure, vibrancy and how fast colour moves across the flame.',
    half: 4,
    weight: 25,
  },
] as const satisfies readonly {
  key: DuelComponent['key']
  label: string
  detail: string
  half: number
  weight: number
}[]

/** The raw measurements, before any curve. */
function rawComponents(
  flame: FlameDescriptor,
): Record<DuelComponent['key'], number> {
  const stats = calculateFlameStats(flame)
  const m = stats.metrics
  // `calculateFlameStats` has already applied its own caps, so its outputs
  // are read back through them: dividing by the constant each cap used
  // recovers the raw measurement wherever the cap did not bite, and where it
  // did the curve is fed the capped value, which is the honest floor.
  return {
    complexity: m.complexity,
    chaos: m.chaosLevel / 1.5,
    symmetry: m.symmetryScore / 2.5,
    energy: m.energyIntensity,
  }
}

/**
 * v1: the same four measurements, on curves that do not stop counting.
 *
 * Chaos and symmetry carry the most weight because that is what the brief
 * says the sheet rewards. The components travel with the verdict so the
 * result card can show its working.
 */
export const powerCurveJudge: DuelJudge = {
  judge(player, rival) {
    const p = rawComponents(player)
    const r = rawComponents(rival)
    const components = COMPONENTS.map((spec) => ({
      key: spec.key,
      label: spec.label,
      detail: spec.detail,
      player: Number(saturate(p[spec.key], spec.half).toFixed(1)),
      rival: Number(saturate(r[spec.key], spec.half).toFixed(1)),
      weight: spec.weight,
    }))
    const total = (side: 'player' | 'rival') =>
      Math.round(components.reduce((sum, c) => sum + c[side] * c.weight, 0))
    const playerScore = total('player')
    const rivalScore = total('rival')
    const winner: SeatId | 'draw' =
      playerScore === rivalScore
        ? 'draw'
        : playerScore > rivalScore
          ? 'player'
          : 'rival'
    const margin = Math.abs(playerScore - rivalScore)
    const line =
      winner === 'draw'
        ? `A dead heat at ${playerScore} each.`
        : winner === 'player'
          ? `Your flame wins by ${margin}.`
          : `The AI's flame wins by ${margin}.`
    return { winner, line, playerScore, rivalScore, components }
  },
}

/** What the duel uses. One name to change when the judge changes. */
export const duelJudge: DuelJudge = powerCurveJudge
