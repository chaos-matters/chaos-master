import { deepClone } from '@/utils/clone'
import { createClashFlame } from '@/webmcp/tools/createClashFlame'
import { scoreClashRound } from '@/webmcp/tools/scoreClashRound'
import { calculateFlameStats } from '@/webmcp/tools/scoreFlame'
import type { FlameDescriptor, TransformFunction, } from '@/flame/schema/flameSchema'
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
    },
    required: ['flameA', 'flameB'],
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: (input: unknown): SimulateClashResult | { error: string } => {
    const raw = (input ?? {}) as {
      flameA?: FlameDescriptor
      flameB?: FlameDescriptor
      rounds?: number
      seed?: number
      separation?: number
      dimensions?: 2 | 3
      tintA?: number
      tintB?: number
    }

    const {
      flameA,
      flameB,
      rounds = 3,
      seed = 31415,
      separation = 2.2,
      dimensions = 3,
      tintA = 0.15,
      tintB = 0.65,
    } = raw

    if (!flameA || !flameB) {
      return { error: 'Both flameA and flameB must be provided.' }
    }

    const statsA = calculateFlameStats(flameA)
    const statsB = calculateFlameStats(flameB)

    const currentFlameA = deepClone(flameA)
    const currentFlameB = deepClone(flameB)

    const roundOutcomes: ClashRoundOutcome[] = []
    let scoreA = 0
    let scoreB = 0

    for (let r = 1; r <= rounds; r++) {
      // 1. Merge into a staged clash flame
      const clashRes = createClashFlame.execute(
        {
          flameA: currentFlameA,
          flameB: currentFlameB,
          dimensions,
          separation,
          tintA,
          tintB,
          tint: 'override',
          powerA: statsA.powerLevel,
          powerB: statsB.powerLevel,
        },
        {},
      ) as { success?: boolean; clashFlame?: FlameDescriptor }

      const stagedFlame = clashRes.clashFlame ?? deepClone(currentFlameA)

      // 2. Score territory for this round
      const roundSeed = seed + r * 1013
      const roundScore = scoreClashRound.execute(
        {
          clashFlame: stagedFlame,
          tintA,
          tintB,
          seed: roundSeed,
        },
        {},
      ) as ScoreClashRoundResult

      const roundWinner = roundScore.verdict

      if (roundWinner === 'A') scoreA++
      else if (roundWinner === 'B') scoreB++

      // 3. Determine narrative event
      let event: string | null = null
      if (roundScore.contested > 0.35) {
        event = 'Entangled'
      } else if (
        (roundWinner === 'A' &&
          statsA.metrics.energyIntensity > 8 &&
          roundScore.ownershipA > 0.65) ||
        (roundWinner === 'B' &&
          statsB.metrics.energyIntensity > 8 &&
          roundScore.ownershipB > 0.65)
      ) {
        event = 'Nova'
      } else if (
        (roundWinner === 'A' &&
          statsA.metrics.symmetryScore > 6 &&
          statsA.powerLevel < statsB.powerLevel) ||
        (roundWinner === 'B' &&
          statsB.metrics.symmetryScore > 6 &&
          statsB.powerLevel < statsA.powerLevel)
      ) {
        event = 'Symmetry Lock'
      } else if (
        (roundWinner === 'A' &&
          statsA.metrics.chaosLevel > 7 &&
          r > 1 &&
          roundOutcomes[r - 2]?.winner === 'B') ||
        (roundWinner === 'B' &&
          statsB.metrics.chaosLevel > 7 &&
          r > 1 &&
          roundOutcomes[r - 2]?.winner === 'A')
      ) {
        event = 'Chaos Cascade'
      } else if (roundScore.ownershipA < 0.15 || roundScore.ownershipB < 0.15) {
        event = 'Collapse'
      }

      roundOutcomes.push({
        round: r,
        ownershipA: roundScore.ownershipA,
        ownershipB: roundScore.ownershipB,
        contested: roundScore.contested,
        winner: roundWinner,
        event,
        clashFlame: stagedFlame,
      })

      // 4. Update transform probability balance for the next round
      const winnerSide = roundWinner
      if (winnerSide === 'A') {
        const lossFactor = statsB.metrics.symmetryScore > 5 ? 0.85 : 0.7
        Object.values(currentFlameB.transforms ?? {}).forEach(
          (t: TransformFunction) => {
            t.probability = (t.probability ?? 1) * lossFactor
          },
        )
        Object.values(currentFlameA.transforms ?? {}).forEach(
          (t: TransformFunction) => {
            t.probability = (t.probability ?? 1) * 1.15
          },
        )
      } else if (winnerSide === 'B') {
        const lossFactor = statsA.metrics.symmetryScore > 5 ? 0.85 : 0.7
        Object.values(currentFlameA.transforms ?? {}).forEach(
          (t: TransformFunction) => {
            t.probability = (t.probability ?? 1) * lossFactor
          },
        )
        Object.values(currentFlameB.transforms ?? {}).forEach(
          (t: TransformFunction) => {
            t.probability = (t.probability ?? 1) * 1.15
          },
        )
      }
    }

    const overallWinner = scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'draw'

    return {
      winner: overallWinner,
      rounds: roundOutcomes,
      finalScore: { A: scoreA, B: scoreB },
    }
  },
}
