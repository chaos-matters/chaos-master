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

function extractTransformColor(rawColor: unknown): number {
  if (Array.isArray(rawColor)) return rawColor[0] ?? 0.5
  if (
    typeof rawColor === 'object' &&
    rawColor !== null &&
    'x' in rawColor &&
    typeof (rawColor as { x: number }).x === 'number'
  ) {
    return (rawColor as { x: number }).x
  }
  return typeof rawColor === 'number' ? rawColor : 0.5
}

function stepAffine3D(
  p: [number, number, number],
  aff: Record<string, number>,
): [number, number, number] {
  const a = aff.a ?? 1
  const b = aff.b ?? 0
  const c = aff.c ?? 0
  const d = aff.d ?? 0
  const e = aff.e ?? 0
  const f = aff.f ?? 1
  const g = aff.g ?? 0
  const h = aff.h ?? 0
  const i = aff.i ?? 0
  const j = aff.j ?? 0
  const k = aff.k ?? 1
  const l = aff.l ?? 0
  return [
    a * p[0] + b * p[1] + c * p[2] + d,
    e * p[0] + f * p[1] + g * p[2] + h,
    i * p[0] + j * p[1] + k * p[2] + l,
  ]
}

function stepAffine2D(
  p: [number, number, number],
  aff: Record<string, number>,
): [number, number, number] {
  const a = aff.a ?? 1
  const b = aff.b ?? 0
  const c = aff.c ?? 0
  const d = aff.d ?? 0
  const e = aff.e ?? 1
  const f = aff.f ?? 0
  return [a * p[0] + b * p[1] + c, d * p[0] + e * p[1] + f, p[2]]
}

function stepAffineTransform(
  p: [number, number, number],
  aff?: Record<string, number>,
): [number, number, number] {
  if (!aff) return p
  if (aff.g !== undefined || aff.h !== undefined || aff.l !== undefined) {
    return stepAffine3D(p, aff)
  }
  return stepAffine2D(p, aff)
}

function stepSingleVariation(
  p: [number, number, number],
  type: string,
  w: number,
  rng?: () => number,
): [number, number, number] {
  if (type.startsWith('spherical')) {
    const r2 = p[0] * p[0] + p[1] * p[1] + p[2] * p[2] + 1e-6
    return [(p[0] / r2) * w, (p[1] / r2) * w, (p[2] / r2) * w]
  }
  if (type.startsWith('sinusoidal')) {
    return [Math.sin(p[0]) * w, Math.sin(p[1]) * w, Math.sin(p[2]) * w]
  }
  if (type.startsWith('swirl')) {
    const r2 = p[0] * p[0] + p[1] * p[1]
    const s = Math.sin(r2)
    const c = Math.cos(r2)
    return [(p[0] * c - p[1] * s) * w, (p[0] * s + p[1] * c) * w, p[2] * w]
  }
  if (type.startsWith('julia')) {
    const r = Math.hypot(p[0], p[1])
    const theta = Math.atan2(p[1], p[0])
    const omega = rng && rng() > 0.5 ? Math.PI : 0
    const angle = theta / 2 + omega
    const sqrtR = Math.sqrt(r)
    return [sqrtR * Math.cos(angle) * w, sqrtR * Math.sin(angle) * w, p[2] * w]
  }
  if (type.startsWith('polar')) {
    const r = Math.hypot(p[0], p[1])
    const theta = Math.atan2(p[1], p[0])
    return [(theta / Math.PI) * w, (r - 1.0) * w, p[2] * w]
  }
  if (type.startsWith('ngon')) {
    const phi = Math.atan2(p[1], p[0])
    const r = Math.hypot(p[0], p[1]) + 1e-6
    const p2 = (2.0 * Math.PI) / 4
    const t3 = phi - p2 * Math.floor(phi / p2)
    const t4 = t3 > p2 / 2.0 ? t3 - p2 : t3
    const kNum = 4 * (1.0 / Math.max(1e-4, Math.cos(t4)) - 1.0) + 4
    const kDen = r * r
    const k = Math.min(10, Math.max(-10, kNum / kDen))
    return [p[0] * k * w, p[1] * k * w, p[2] * w]
  }
  if (type.startsWith('kaleidoscope')) {
    const r = Math.hypot(p[0], p[1])
    let theta = Math.atan2(p[1], p[0])
    const sector = (2 * Math.PI) / 6
    theta = ((theta % sector) + sector) % sector
    if (theta > sector / 2) {
      theta = sector - theta
    }
    return [r * Math.cos(theta) * w, r * Math.sin(theta) * w, p[2] * w]
  }
  return [p[0] * w, p[1] * w, p[2] * w]
}

function stepVariation(
  p: [number, number, number],
  t: TransformFunction,
  rng?: () => number,
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
    const [dx, dy, dz] = stepSingleVariation(p, type, w, rng)
    vx += dx
    vy += dy
    vz += dz
  }

  return totalW > 0 ? [vx / totalW, vy / totalW, vz / totalW] : p
}

function stepTransform(
  p: [number, number, number],
  t: TransformFunction,
  rng?: () => number,
): [number, number, number] {
  const pre = stepAffineTransform(p, t.preAffine)
  const mid = stepVariation(pre, t, rng)
  return stepAffineTransform(mid, t.postAffine)
}

function toVoxelKey(p: [number, number, number]): string {
  const vx = Math.trunc(Math.max(-8, Math.min(8, p[0])) * 2)
  const vy = Math.trunc(Math.max(-8, Math.min(8, p[1])) * 2)
  const vz = Math.trunc(Math.max(-8, Math.min(8, p[2])) * 2)
  return `${vx},${vy},${vz}`
}

function simulateTeamTrajectory(
  initialPos: [number, number, number],
  teamList: Array<{ id: string; prob: number }>,
  transforms: [string, TransformFunction][],
  iters: number,
  voxels: Map<string, number>,
  rng: () => number,
): void {
  if (teamList.length === 0) return
  let p: [number, number, number] = initialPos
  const teamEntries = transforms.filter(([id]) =>
    teamList.some((t) => t.id === id),
  )
  const totalProb = teamList.reduce((acc, x) => acc + x.prob, 0)
  for (let i = 0; i < iters; i++) {
    let r = rng() * totalProb
    let chosen = teamEntries[0]?.[1]
    for (const [id, t] of teamEntries) {
      const prob = teamList.find((item) => item.id === id)?.prob ?? 1
      if (r <= prob) {
        chosen = t
        break
      }
      r -= prob
    }
    if (chosen) {
      p = stepTransform(p, chosen, rng)
      if (i > 20) {
        const key = toVoxelKey(p)
        voxels.set(key, (voxels.get(key) || 0) + 1)
      }
    }
  }
}

function calculateTeamSymmetryStrength(
  transforms: [string, TransformFunction][],
): { symStrengthA: number; symStrengthB: number } {
  let symStrengthA = 0
  let symStrengthB = 0
  for (const [id, t] of transforms) {
    const hasSymVar = Object.values(t.variations ?? {}).some((v) => {
      const type = (v as { type?: string }).type ?? ''
      return (
        type.startsWith('julia') ||
        type.startsWith('polar') ||
        type.startsWith('ngon') ||
        type.startsWith('kaleidoscope')
      )
    })
    if (id.includes('_sym__') || hasSymVar) {
      if (id.startsWith('p1_')) symStrengthA++
      if (id.startsWith('p2_')) symStrengthB++
    }
  }
  return { symStrengthA, symStrengthB }
}

function evaluateSpatialOwnership(
  voxelsA: Map<string, number>,
  voxelsB: Map<string, number>,
  symStrengthA: number,
  symStrengthB: number,
  sumProbA: number,
  sumProbB: number,
  probShareA: number,
  probShareB: number,
  sampleBudget: number,
): ScoreClashRoundResult {
  const allVoxelKeys = new Set([...voxelsA.keys(), ...voxelsB.keys()])
  let voxA = 0
  let voxB = 0
  let voxContested = 0

  for (const key of allVoxelKeys) {
    const cA = voxelsA.get(key) || 0
    const cB = voxelsB.get(key) || 0
    if (cA > 0 && cB === 0) {
      voxA++
    } else if (cB > 0 && cA === 0) {
      voxB++
    } else if (cA > 0 && cB > 0) {
      const weightA = cA * (1 + Math.min(0.3, symStrengthA * 0.05))
      const weightB = cB * (1 + Math.min(0.3, symStrengthB * 0.05))
      if (weightA > weightB * 2) {
        voxA += 0.7
        voxContested += 0.3
      } else if (weightB > weightA * 2) {
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
  const spatialContested = totalOccupied > 0 ? voxContested / totalOccupied : 0

  let rawOwnA: number
  let rawOwnB: number
  if (sumProbA === sumProbB) {
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
      const color = extractTransformColor(t.color)
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
    const itersPerTeam = Math.max(100, Math.floor(sampleBudget / 2))
    const voxelsA = new Map<string, number>()
    const voxelsB = new Map<string, number>()

    simulateTeamTrajectory(
      [-1, 0, 0],
      p1List,
      transforms,
      itersPerTeam,
      voxelsA,
      rngA,
    )
    simulateTeamTrajectory(
      [1, 0, 0],
      p2List,
      transforms,
      itersPerTeam,
      voxelsB,
      rngB,
    )

    const { symStrengthA, symStrengthB } =
      calculateTeamSymmetryStrength(transforms)

    return evaluateSpatialOwnership(
      voxelsA,
      voxelsB,
      symStrengthA,
      symStrengthB,
      sumProbA,
      sumProbB,
      probShareA,
      probShareB,
      sampleBudget,
    )
  },
}
