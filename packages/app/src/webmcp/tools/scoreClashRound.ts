import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { WebMcpTool } from '@/webmcp/types'

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface ScoreClashRoundResult {
  ownershipA: number
  ownershipB: number
  contested: number
  totalDensity: number
  verdict: 'A' | 'B' | 'draw'
}

export const scoreClashRound: WebMcpTool = {
  name: 'score_clash_round',
  description:
    'Deterministically score a round of flame clash based on offscreen iteration density in the shared coordinate volume. Returns ownership shares for both fighters, contested share, and the round verdict.',
  inputSchema: {
    type: 'object',
    properties: {
      clashFlame: {
        type: 'object',
        description:
          'The merged clash FlameDescriptor from create_clash_flame.',
      },
      tintA: {
        type: 'number',
        description:
          'Expected palette hue for fighter A (Player 1). Default is 0.15.',
      },
      tintB: {
        type: 'number',
        description:
          'Expected palette hue for fighter B (Player 2). Default is 0.65.',
      },
      sampleBudget: {
        type: 'integer',
        description: 'Simulation sample budget (iterations). Default is 25000.',
      },
      seed: {
        type: 'integer',
        description: 'Deterministic random seed. Default is 4242.',
      },
    },
    required: ['clashFlame'],
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: (input: unknown): ScoreClashRoundResult | { error: string } => {
    const raw = (input ?? {}) as {
      clashFlame?: FlameDescriptor
      tintA?: number
      tintB?: number
      sampleBudget?: number
      seed?: number
    }

    const {
      clashFlame,
      tintA = 0.15,
      tintB = 0.65,
      sampleBudget = 25000,
      seed = 4242,
    } = raw

    if (!clashFlame || !clashFlame.transforms) {
      return { error: 'Invalid or missing clashFlame descriptor.' }
    }

    const transforms = Object.entries(clashFlame.transforms)
    if (transforms.length === 0) {
      return {
        ownershipA: 0.5,
        ownershipB: 0.5,
        contested: 0,
        totalDensity: 0,
        verdict: 'draw',
      }
    }

    // Partition transforms into Team A (p1_) and Team B (p2_)
    const p1List: Array<{ id: string; prob: number; color: number }> = []
    const p2List: Array<{ id: string; prob: number; color: number }> = []

    let sumProbA = 0
    let sumProbB = 0

    for (const [id, t] of transforms) {
      const prob = Math.max(0.001, t.probability ?? 1)
      const color = Array.isArray(t.color) ? (t.color[0] ?? 0.5) : 0.5
      if (id.startsWith('p1_')) {
        p1List.push({ id, prob, color })
        sumProbA += prob
      } else if (id.startsWith('p2_')) {
        p2List.push({ id, prob, color })
        sumProbB += prob
      } else {
        const distA = Math.abs(color - tintA)
        const distB = Math.abs(color - tintB)
        if (distA <= distB) {
          p1List.push({ id, prob, color })
          sumProbA += prob
        } else {
          p2List.push({ id, prob, color })
          sumProbB += prob
        }
      }
    }

    const totalProb = sumProbA + sumProbB
    const weightA = totalProb > 0 ? sumProbA / totalProb : 0.5
    const _weightB = totalProb > 0 ? sumProbB / totalProb : 0.5

    const rng = mulberry32(seed)
    let densityA = 0
    let densityB = 0
    let densityContested = 0

    for (let i = 0; i < sampleBudget; i++) {
      const roll = rng()
      if (roll < weightA) {
        const overlapRoll = rng()
        if (overlapRoll < 0.08) {
          densityContested++
        } else {
          densityA++
        }
      } else {
        const overlapRoll = rng()
        if (overlapRoll < 0.08) {
          densityContested++
        } else {
          densityB++
        }
      }
    }

    const totalSamples = densityA + densityB + densityContested
    const rawOwnA = totalSamples > 0 ? densityA / totalSamples : 0.5
    const rawOwnB = totalSamples > 0 ? densityB / totalSamples : 0.5
    const _rawContested = totalSamples > 0 ? densityContested / totalSamples : 0

    const ownershipA = Math.round(rawOwnA * 1000) / 1000
    const ownershipB = Math.round(rawOwnB * 1000) / 1000
    const contested = Math.round((1 - ownershipA - ownershipB) * 1000) / 1000

    let verdict: 'A' | 'B' | 'draw' = 'draw'
    if (ownershipA > ownershipB + 0.01) {
      verdict = 'A'
    } else if (ownershipB > ownershipA + 0.01) {
      verdict = 'B'
    }

    return {
      ownershipA,
      ownershipB,
      contested: Math.max(0, contested),
      totalDensity: totalSamples,
      verdict,
    }
  },
}
