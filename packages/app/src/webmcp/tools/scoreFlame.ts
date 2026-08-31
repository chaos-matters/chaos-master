import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { WebMcpTool } from '@/webmcp/types'

function calculateFlameStats(flame: FlameDescriptor) {
  const transforms = Object.values(flame.transforms ?? {})

  // 1. Complexity
  const transformCount = transforms.length
  let variationCount = 0
  let nonLinearWeightSum = 0
  let symmetryHits = 0

  // Symmetry indicators
  const symmetryVars = new Set([
    'arch',
    'cylinder',
    'julia',
    'julia3D',
    'ngon',
    'mirror',
  ])

  for (const t of transforms) {
    if (!t.visible) continue
    const vars = Object.entries(t.variations || {})
    variationCount += vars.length

    for (const [vName, vData] of vars) {
      const weight = Math.abs(vData.weight)
      if (vName !== 'linear' && vName !== 'linear3D') {
        nonLinearWeightSum += weight
      }
      if (symmetryVars.has(vName)) {
        symmetryHits += weight
      }
    }
  }

  const complexity = Math.min(10, transformCount * 0.5 + variationCount * 0.2)

  // 2. Chaos Level (How non-linear is it?)
  const chaosLevel = Math.min(10, nonLinearWeightSum * 1.5)

  // 3. Symmetry Score
  const symmetryScore = Math.min(10, symmetryHits * 2.5)

  // 4. Energy Intensity
  const rs = flame.renderSettings
  const exposure = rs?.exposure ?? 0.25
  const vibrancy = rs?.vibrancy ?? 0.5

  let colorSpeedSum = 0
  for (const t of transforms) {
    if (t.visible) colorSpeedSum += Math.abs(t.colorSpeed ?? 0.4)
  }
  const avgColorSpeed = transformCount > 0 ? colorSpeedSum / transformCount : 0

  const energyIntensity = Math.min(
    10,
    exposure * 2 + vibrancy * 2 + avgColorSpeed * 5,
  )

  // Overall Power Level
  // Weighted sum of the stats
  const overallPower = Math.round(
    complexity * 100 +
      chaosLevel * 150 +
      symmetryScore * 80 +
      energyIntensity * 120,
  )

  // Classify Type
  let type = 'Hybrid'
  if (chaosLevel > 7 && symmetryScore < 3) type = 'Chaotic Vortex'
  else if (symmetryScore > 6 && chaosLevel < 5) type = 'Structured Mandala'
  else if (energyIntensity > 8) type = 'Energy Burst'
  else if (complexity > 8) type = 'Neural Web'

  return {
    powerLevel: overallPower,
    type,
    metrics: {
      complexity: Number(complexity.toFixed(1)),
      chaosLevel: Number(chaosLevel.toFixed(1)),
      symmetryScore: Number(symmetryScore.toFixed(1)),
      energyIntensity: Number(energyIntensity.toFixed(1)),
    },
    rawStats: {
      transformCount,
      variationCount,
    },
  }
}

export const scoreFlame: WebMcpTool = {
  name: 'score_flame',
  description:
    'Evaluates a flame mathematically to generate RPG/Arena-style stats (Power Level, Complexity, Chaos, Symmetry, Energy). If no flame is provided, evaluates the current workspace flame.',
  inputSchema: {
    type: 'object',
    properties: {
      flame: {
        type: 'object',
        description:
          'Optional. The flame descriptor to score. Omit to score the current workspace flame.',
      },
    },
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: (input: unknown) => {
    const rawInput = input as { flame?: unknown } | undefined
    let flame = rawInput?.flame as FlameDescriptor | undefined

    if (!flame) {
      const ctx = getWebMcpContext()
      if (!ctx) {
        return {
          error:
            'No active workspace context available, and no flame provided in input.',
        }
      }
      flame = ctx.flameDescriptor()
      if (!flame) {
        return {
          error: 'No active flame descriptor found in workspace context.',
        }
      }
    }

    try {
      const stats = calculateFlameStats(flame)
      return {
        success: true,
        stats,
      }
    } catch (err) {
      return {
        error: `Failed to score flame: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}
