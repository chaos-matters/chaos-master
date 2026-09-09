import { resolveClashCombat } from '@/flame/stats'
import { deepClone } from '@/utils/clone'
import { calculateEffectivePower, TACTICAL_STANCES, } from '@/webmcp/tools/arenaArchetypes'
import { createClashFlame } from '@/webmcp/tools/createClashFlame'
import { scoreClashRound } from '@/webmcp/tools/scoreClashRound'
import { calculateFlameStats } from '@/webmcp/tools/scoreFlame'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ClashCombatResult } from '@/flame/stats'
import type { TacticalStance } from '@/webmcp/tools/arenaArchetypes'
import type { ScoreClashRoundResult } from '@/webmcp/tools/scoreClashRound'
import type { WebMcpTool } from '@/webmcp/types'

export interface ClashRoundOutcome {
  round: number
  ownershipA: number
  ownershipB: number
  contested: number
  winner: 'A' | 'B' | 'draw'
  event: string | null
  clashFlame: FlameDescriptor
}

export interface SimulateClashResult {
  winner: 'A' | 'B' | 'draw'
  rounds: ClashRoundOutcome[]
  finalScore: { A: number; B: number }
  combat?: ClashCombatResult
  battleLog?: string[]
}

export type StanceAdjustedFlameStats = ReturnType<typeof calculateFlameStats>

export function calculateStanceAdjustedStats(
  flame: FlameDescriptor,
  stance: TacticalStance,
): StanceAdjustedFlameStats {
  const baseStats = calculateFlameStats(flame)
  const stanceInfo = TACTICAL_STANCES[stance] ?? TACTICAL_STANCES.balanced
  return {
    ...baseStats,
    powerLevel: calculateEffectivePower(baseStats.powerLevel, stance),
    metrics: {
      complexity:
        baseStats.metrics.complexity * stanceInfo.effects.complexityMultiplier,
      chaosLevel:
        baseStats.metrics.chaosLevel * stanceInfo.effects.chaosMultiplier,
      symmetryScore:
        baseStats.metrics.symmetryScore * stanceInfo.effects.symmetryMultiplier,
      energyIntensity:
        baseStats.metrics.energyIntensity * stanceInfo.effects.energyMultiplier,
    },
  }
}

function isNovaEvent(
  winner: 'A' | 'B' | 'draw',
  statsA: StanceAdjustedFlameStats,
  statsB: StanceAdjustedFlameStats,
  score: ScoreClashRoundResult,
): boolean {
  if (winner === 'A') {
    return statsA.metrics.energyIntensity > 8 && score.ownershipA > 0.65
  }
  if (winner === 'B') {
    return statsB.metrics.energyIntensity > 8 && score.ownershipB > 0.65
  }
  return false
}

function isSymmetryLockEvent(
  winner: 'A' | 'B' | 'draw',
  statsA: StanceAdjustedFlameStats,
  statsB: StanceAdjustedFlameStats,
): boolean {
  if (winner === 'A') {
    return (
      statsA.metrics.symmetryScore > 6 && statsA.powerLevel < statsB.powerLevel
    )
  }
  if (winner === 'B') {
    return (
      statsB.metrics.symmetryScore > 6 && statsB.powerLevel < statsA.powerLevel
    )
  }
  return false
}

function isChaosCascadeEvent(
  winner: 'A' | 'B' | 'draw',
  statsA: StanceAdjustedFlameStats,
  statsB: StanceAdjustedFlameStats,
  roundIndex: number,
  prevWinner?: 'A' | 'B' | 'draw',
): boolean {
  if (roundIndex <= 1) return false
  if (winner === 'A') {
    return statsA.metrics.chaosLevel > 7 && prevWinner === 'B'
  }
  if (winner === 'B') {
    return statsB.metrics.chaosLevel > 7 && prevWinner === 'A'
  }
  return false
}

export function detectNarrativeEvent(
  roundWinner: 'A' | 'B' | 'draw',
  roundScore: ScoreClashRoundResult,
  statsA: StanceAdjustedFlameStats,
  statsB: StanceAdjustedFlameStats,
  roundIndex: number,
  previousWinner?: 'A' | 'B' | 'draw',
): string | null {
  if (roundScore.contested > 0.35) return 'Entangled'
  if (isNovaEvent(roundWinner, statsA, statsB, roundScore)) return 'Nova'
  if (isSymmetryLockEvent(roundWinner, statsA, statsB)) return 'Symmetry Lock'
  if (
    isChaosCascadeEvent(roundWinner, statsA, statsB, roundIndex, previousWinner)
  ) {
    return 'Chaos Cascade'
  }
  if (roundScore.ownershipA < 0.15 || roundScore.ownershipB < 0.15)
    return 'Collapse'
  return null
}

export function applyRoundProbabilityRebalance(
  stagedFlame: FlameDescriptor,
  winnerSide: 'A' | 'B' | 'draw',
  statsA: StanceAdjustedFlameStats,
  statsB: StanceAdjustedFlameStats,
): void {
  if (winnerSide === 'draw') return

  const lossFactor =
    winnerSide === 'A'
      ? statsB.metrics.symmetryScore > 5
        ? 0.85
        : 0.7
      : statsA.metrics.symmetryScore > 5
        ? 0.85
        : 0.7

  const winningPrefix = winnerSide === 'A' ? 'p1_' : 'p2_'
  const losingPrefix = winnerSide === 'A' ? 'p2_' : 'p1_'

  for (const [key, t] of Object.entries(stagedFlame.transforms ?? {})) {
    const prob = t.probability ?? 1
    if (key.startsWith(winningPrefix)) {
      t.probability = prob * 1.15
    } else if (key.startsWith(losingPrefix)) {
      t.probability = prob * lossFactor
    }
  }
}

export function determineOverallWinner(
  scoreA: number,
  scoreB: number,
): 'A' | 'B' | 'draw' {
  if (scoreA > scoreB) return 'A'
  if (scoreB > scoreA) return 'B'
  return 'draw'
}

export interface ParsedSimulateClashParams {
  flameA: FlameDescriptor
  flameB: FlameDescriptor
  rounds: number
  seed: number
  separation: number
  dimensions: 2 | 3
  tintA: number
  tintB: number
  stanceA: TacticalStance
  stanceB: TacticalStance
}

export function parseSimulateClashInput(
  input: unknown,
): ParsedSimulateClashParams | { error: string } {
  const raw = (input ?? {}) as {
    flameA?: FlameDescriptor
    flameB?: FlameDescriptor
    rounds?: number
    seed?: number
    separation?: number
    dimensions?: 2 | 3
    tintA?: number
    tintB?: number
    stanceA?: TacticalStance
    stanceB?: TacticalStance
  }

  if (!raw.flameA || !raw.flameB) {
    return { error: 'Both flameA and flameB must be provided.' }
  }

  return {
    flameA: raw.flameA,
    flameB: raw.flameB,
    rounds: raw.rounds ?? 3,
    seed: raw.seed ?? 31415,
    separation: raw.separation ?? 2.2,
    dimensions: raw.dimensions ?? 3,
    tintA: raw.tintA ?? 0.15,
    tintB: raw.tintB ?? 0.65,
    stanceA: raw.stanceA ?? 'balanced',
    stanceB: raw.stanceB ?? 'balanced',
  }
}

export function simulateRounds(
  params: ParsedSimulateClashParams,
  statsA: StanceAdjustedFlameStats,
  statsB: StanceAdjustedFlameStats,
): { roundOutcomes: ClashRoundOutcome[]; scoreA: number; scoreB: number } {
  const { flameA, flameB, dimensions, separation, tintA, tintB, rounds, seed } =
    params

  const clashRes = createClashFlame.execute(
    {
      flameA,
      flameB,
      dimensions,
      separation,
      tintA,
      tintB,
      tint: 'override',
    },
    {},
  ) as { success?: boolean; clashFlame?: FlameDescriptor }

  const stagedFlame = clashRes.clashFlame ?? deepClone(flameA)
  const roundOutcomes: ClashRoundOutcome[] = []
  let scoreA = 0
  let scoreB = 0

  for (let r = 1; r <= rounds; r++) {
    const currentStagedFlame = deepClone(stagedFlame)
    const roundSeed = seed + r * 1013
    const roundScore = scoreClashRound.execute(
      {
        clashFlame: currentStagedFlame,
        seed: roundSeed,
      },
      {},
    ) as ScoreClashRoundResult

    const roundWinner = roundScore.verdict
    if (roundWinner === 'A') scoreA++
    else if (roundWinner === 'B') scoreB++

    const prevWinner = r > 1 ? roundOutcomes[r - 2]?.winner : undefined
    const event = detectNarrativeEvent(
      roundWinner,
      roundScore,
      statsA,
      statsB,
      r,
      prevWinner,
    )

    roundOutcomes.push({
      round: r,
      ownershipA: roundScore.ownershipA,
      ownershipB: roundScore.ownershipB,
      contested: roundScore.contested,
      winner: roundWinner,
      event,
      clashFlame: currentStagedFlame,
    })

    applyRoundProbabilityRebalance(stagedFlame, roundWinner, statsA, statsB)
  }

  return { roundOutcomes, scoreA, scoreB }
}

export const simulateClash: WebMcpTool = {
  name: 'simulate_clash',
  description:
    'Simulate a multi-round territory clash between two flames. Returns round outcomes, ownership metrics, narrative events, and the progressive staged clash flame descriptors.',
  inputSchema: {
    type: 'object',
    properties: {
      flameA: {
        type: 'object',
        description: 'First fighter flame descriptor (Player 1).',
      },
      flameB: {
        type: 'object',
        description: 'Second fighter flame descriptor (Player 2).',
      },
      rounds: {
        type: 'integer',
        description: 'Number of battle rounds. Default is 3.',
      },
      seed: {
        type: 'integer',
        description: 'Deterministic random seed. Default is 31415.',
      },
      separation: {
        type: 'number',
        description: 'Distance from origin in 3D. Default is 2.2.',
      },
      dimensions: {
        type: 'integer',
        enum: [2, 3],
        description: 'Staging dimension: 2 for 2D, 3 for 3D. Default is 3.',
      },
      tintA: {
        type: 'number',
        description: 'Palette hue for Player 1. Default is 0.15.',
      },
      tintB: {
        type: 'number',
        description: 'Palette hue for Player 2. Default is 0.65.',
      },
      stanceA: {
        type: 'string',
        enum: ['balanced', 'resonance', 'bastion', 'entropy'],
        description:
          'Tactical battle stance for Player 1. Default is balanced.',
      },
      stanceB: {
        type: 'string',
        enum: ['balanced', 'resonance', 'bastion', 'entropy'],
        description:
          'Tactical battle stance for Player 2. Default is balanced.',
      },
    },
    required: ['flameA', 'flameB'],
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: (input: unknown): SimulateClashResult | { error: string } => {
    const parsed = parseSimulateClashInput(input)
    if ('error' in parsed) {
      return parsed
    }

    const statsA = calculateStanceAdjustedStats(parsed.flameA, parsed.stanceA)
    const statsB = calculateStanceAdjustedStats(parsed.flameB, parsed.stanceB)

    const { roundOutcomes, scoreA, scoreB } = simulateRounds(
      parsed,
      statsA,
      statsB,
    )
    const overallWinner = determineOverallWinner(scoreA, scoreB)

    const combat = resolveClashCombat({
      nameA: parsed.flameA.metadata?.name || 'Player 1',
      nameB: parsed.flameB.metadata?.name || 'Player 2',
      flameA: parsed.flameA,
      flameB: parsed.flameB,
      stanceA: parsed.stanceA,
      stanceB: parsed.stanceB,
      rounds: parsed.rounds,
      seed: parsed.seed,
      territoryWinner: overallWinner,
    })

    return {
      winner: overallWinner,
      rounds: roundOutcomes,
      finalScore: { A: scoreA, B: scoreB },
      combat,
      battleLog: combat.battleLog,
    }
  },
}
