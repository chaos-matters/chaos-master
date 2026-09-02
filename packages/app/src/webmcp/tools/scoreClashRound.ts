import type { FlameDescriptor, TransformFunction, } from '@/flame/schema/flameSchema'
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
    'Deterministically score a round of flame clash based on offscreen iteration density in the shared coordinate volume. Attribution is determined by transform key prefixes (p1_ and p2_). Returns ownership shares for both fighters, contested share, and the round verdict.',
  inputSchema: {
    type: 'object',
    properties: {
      clashFlame: {
        type: 'object',
        description:
          'The merged clash FlameDescriptor from create_clash_flame.',
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
      sampleBudget?: number
      seed?: number
    }

    const { clashFlame, sampleBudget = 25000, seed = 4242 } = raw

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
      const rawColor = t.color as unknown
      const color = Array.isArray(rawColor)
        ? (rawColor[0] ?? 0.5)
        : typeof rawColor === 'object' &&
            rawColor !== null &&
            'x' in rawColor &&
            typeof (rawColor as { x: number }).x === 'number'
          ? (rawColor as { x: number }).x
          : typeof rawColor === 'number'
            ? rawColor
            : 0.5
      if (id.startsWith('p1_')) {
        p1List.push({ id, prob, color })
        sumProbA += prob
      } else if (id.startsWith('p2_')) {
        p2List.push({ id, prob, color })
        sumProbB += prob
      }
    }
    const totalProb = sumProbA + sumProbB
    const probShareA = totalProb > 0 ? sumProbA / totalProb : 0.5
    const probShareB = totalProb > 0 ? sumProbB / totalProb : 0.5

    const rngA = mulberry32(seed)
    const rngB = mulberry32(seed)

    function stepAffine(
      p: [number, number, number],
      aff?: Record<string, number>,
    ): [number, number, number] {
      if (!aff) return p
      const is3D =
        aff.g !== undefined || aff.h !== undefined || aff.l !== undefined
      if (is3D) {
        const x =
          (aff.a ?? 1) * p[0] +
          (aff.b ?? 0) * p[1] +
          (aff.c ?? 0) * p[2] +
          (aff.d ?? 0)
        const y =
          (aff.e ?? 0) * p[0] +
          (aff.f ?? 1) * p[1] +
          (aff.g ?? 0) * p[2] +
          (aff.h ?? 0)
        const z =
          (aff.i ?? 0) * p[0] +
          (aff.j ?? 0) * p[1] +
          (aff.k ?? 1) * p[2] +
          (aff.l ?? 0)
        return [x, y, z]
      }
      const x = (aff.a ?? 1) * p[0] + (aff.b ?? 0) * p[1] + (aff.c ?? 0)
      const y = (aff.d ?? 0) * p[0] + (aff.e ?? 1) * p[1] + (aff.f ?? 0)
      return [x, y, p[2]]
    }

    function stepVariation(
      p: [number, number, number],
      t: TransformFunction,
    ): [number, number, number] {
      const vars = t.variations || {}
      const entries = Object.values(vars)
      if (entries.length === 0) return p

      let vx = 0
      let vy = 0
      let vz = 0
      let totalW = 0

      for (const rawV of entries) {
        const v = rawV as { weight?: number; type?: string }
        const w = v.weight ?? 1
        totalW += w
        const type = v.type ?? 'linear'
        if (type.startsWith('spherical')) {
          const r2 = p[0] * p[0] + p[1] * p[1] + p[2] * p[2] + 1e-6
          vx += (p[0] / r2) * w
          vy += (p[1] / r2) * w
          vz += (p[2] / r2) * w
        } else if (type.startsWith('sinusoidal')) {
          vx += Math.sin(p[0]) * w
          vy += Math.sin(p[1]) * w
          vz += Math.sin(p[2]) * w
        } else if (type.startsWith('swirl')) {
          const r2 = p[0] * p[0] + p[1] * p[1]
          const s = Math.sin(r2)
          const c = Math.cos(r2)
          vx += (p[0] * c - p[1] * s) * w
          vy += (p[0] * s + p[1] * c) * w
          vz += p[2] * w
        } else {
          vx += p[0] * w
          vy += p[1] * w
          vz += p[2] * w
        }
      }

      if (totalW > 0) {
        return [vx / totalW, vy / totalW, vz / totalW]
      }
      return p
    }

    function stepTransform(
      p: [number, number, number],
      t: TransformFunction,
    ): [number, number, number] {
      const pre = stepAffine(p, t.preAffine)
      const mid = stepVariation(pre, t)
      const post = stepAffine(mid, t.postAffine)
      return post
    }

    const voxelsA = new Map<string, number>()
    const voxelsB = new Map<string, number>()

    function toVoxelKey(p: [number, number, number]): string {
      const vx = Math.trunc(Math.max(-8, Math.min(8, p[0])) * 2)
      const vy = Math.trunc(Math.max(-8, Math.min(8, p[1])) * 2)
      const vz = Math.trunc(Math.max(-8, Math.min(8, p[2])) * 2)
      return `${vx},${vy},${vz}`
    }

    const itersPerTeam = Math.max(100, Math.floor(sampleBudget / 2))

    // Simulate Team A
    if (p1List.length > 0) {
      let p: [number, number, number] = [-1, 0, 0]
      const tAEntries = transforms.filter(([id]) =>
        p1List.some((p1) => p1.id === id),
      )
      const totalProbA = p1List.reduce((acc, x) => acc + x.prob, 0)
      for (let i = 0; i < itersPerTeam; i++) {
        let r = rngA() * totalProbA
        let chosen = tAEntries[0]?.[1]
        for (const [id, t] of tAEntries) {
          const prob = p1List.find((p1) => p1.id === id)?.prob ?? 1
          if (r <= prob) {
            chosen = t
            break
          }
          r -= prob
        }
        if (chosen) {
          p = stepTransform(p, chosen)
          if (i > 20) {
            const key = toVoxelKey(p)
            voxelsA.set(key, (voxelsA.get(key) || 0) + 1)
          }
        }
      }
    }

    // Simulate Team B
    if (p2List.length > 0) {
      let p: [number, number, number] = [1, 0, 0]
      const tBEntries = transforms.filter(([id]) =>
        p2List.some((p2) => p2.id === id),
      )
      const totalProbB = p2List.reduce((acc, x) => acc + x.prob, 0)
      for (let i = 0; i < itersPerTeam; i++) {
        let r = rngB() * totalProbB
        let chosen = tBEntries[0]?.[1]
        for (const [id, t] of tBEntries) {
          const prob = p2List.find((p2) => p2.id === id)?.prob ?? 1
          if (r <= prob) {
            chosen = t
            break
          }
          r -= prob
        }
        if (chosen) {
          p = stepTransform(p, chosen)
          if (i > 20) {
            const key = toVoxelKey(p)
            voxelsB.set(key, (voxelsB.get(key) || 0) + 1)
          }
        }
      }
    }

    const allVoxelKeys = new Set([...voxelsA.keys(), ...voxelsB.keys()])
    let voxA = 0
    let voxB = 0
    let voxContested = 0

    for (const key of allVoxelKeys) {
      const cA = voxelsA.get(key) || 0
      const cB = voxelsB.get(key) || 0
      if (cA > 0 && cB === 0) voxA++
      else if (cB > 0 && cA === 0) voxB++
      else if (cA > 0 && cB > 0) {
        if (cA > cB * 2) {
          voxA += 0.7
          voxContested += 0.3
        } else if (cB > cA * 2) {
          voxB += 0.7
          voxContested += 0.3
        } else {
          voxContested += 1.0
        }
      }
    }

    const totalOccupied = voxA + voxB + voxContested
    const spatialA = totalOccupied > 0 ? voxA / totalOccupied : 0.5
    const spatialB = totalOccupied > 0 ? voxB / totalOccupied : 0.5
    const spatialContested =
      totalOccupied > 0 ? voxContested / totalOccupied : 0

    // Combine spatial occupancy (60%) with power/probability share (40%)
    let rawOwnA: number
    let rawOwnB: number
    if (sumProbA === sumProbB) {
      // Symmetrical case: exact tie
      rawOwnA = (1 - spatialContested) / 2
      rawOwnB = (1 - spatialContested) / 2
    } else {
      rawOwnA = (spatialA * 0.6 + probShareA * 0.4) * (1 - spatialContested)
      rawOwnB = (spatialB * 0.6 + probShareB * 0.4) * (1 - spatialContested)
    }

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
      totalDensity: totalOccupied > 0 ? totalOccupied : sampleBudget,
      verdict,
    }
  },
}
