import { executeCommand } from '@/commands/registry'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { GenerateRandomFlameConfig } from '@/flame/randomize'
import type { WebMcpTool } from '@/webmcp/types'

interface RandomizeRangeParams {
  minTransforms: number
  maxTransforms: number
  minVariations: number
  maxVariations: number
  strength: number
}

function resolveRandomizeRanges(
  raw?: Record<string, unknown>,
): RandomizeRangeParams {
  return {
    minTransforms:
      typeof raw?.minTransforms === 'number'
        ? Math.round(raw.minTransforms)
        : 2,
    maxTransforms:
      typeof raw?.maxTransforms === 'number'
        ? Math.round(raw.maxTransforms)
        : 4,
    minVariations:
      typeof raw?.minVariations === 'number'
        ? Math.round(raw.minVariations)
        : 1,
    maxVariations:
      typeof raw?.maxVariations === 'number'
        ? Math.round(raw.maxVariations)
        : 2,
    strength: typeof raw?.strength === 'number' ? raw.strength : 0.5,
  }
}

function validateRandomizeRanges(
  params: RandomizeRangeParams,
): { error: string } | null {
  const {
    minTransforms,
    maxTransforms,
    minVariations,
    maxVariations,
    strength,
  } = params

  if (
    minTransforms < 1 ||
    maxTransforms > 10 ||
    minTransforms > maxTransforms
  ) {
    return {
      error:
        'Invalid transform count range: minTransforms must be >= 1, maxTransforms <= 10, and minTransforms <= maxTransforms.',
    }
  }

  if (
    minVariations < 1 ||
    maxVariations > 10 ||
    minVariations > maxVariations
  ) {
    return {
      error:
        'Invalid variation count range: minVariations must be >= 1, maxVariations <= 10, and minVariations <= maxVariations.',
    }
  }

  if (strength < 0 || strength > 1) {
    return { error: 'Invalid strength: must be a number between 0 and 1.' }
  }

  return null
}

function resolveSeed(rawSeed?: unknown): number {
  if (typeof rawSeed === 'number' && Number.isFinite(rawSeed)) {
    return rawSeed >>> 0
  }
  return Math.floor(Math.random() * 0x1_0000_0000)
}

export const randomizeFlame: WebMcpTool = {
  name: 'randomize_flame',
  description:
    'Generate a new random flame, replacing the current one. Provide a seed for reproducible results. Optionally configure transform count and variation count ranges. The result is deterministic per seed.',
  inputSchema: {
    type: 'object',
    properties: {
      seed: {
        type: 'integer',
        description:
          'Random seed (0 to 4294967295). Same seed produces the same flame.',
      },
      minTransforms: {
        type: 'integer',
        minimum: 1,
        maximum: 10,
        description: 'Minimum transforms. Default 2.',
      },
      maxTransforms: {
        type: 'integer',
        minimum: 1,
        maximum: 10,
        description: 'Maximum transforms. Default 4.',
      },
      minVariations: {
        type: 'integer',
        minimum: 1,
        maximum: 10,
        description: 'Minimum variations per transform. Default 1.',
      },
      maxVariations: {
        type: 'integer',
        minimum: 1,
        maximum: 10,
        description: 'Maximum variations per transform. Default 2.',
      },
      strength: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Generation strength 0-1. Default 0.5.',
      },
    },
  },
  execute(input: unknown) {
    const ctx = getWebMcpContext()
    if (!ctx) {
      return {
        error:
          'Workspace not ready. The flame editor has not finished loading.',
      }
    }

    const rawInput =
      typeof input === 'object' && input !== null
        ? (input as Record<string, unknown>)
        : undefined

    const ranges = resolveRandomizeRanges(rawInput)
    const validationError = validateRandomizeRanges(ranges)
    if (validationError) {
      return validationError
    }

    const dims = ctx.flameDescriptor().renderSettings.dimensions === 3 ? 3 : 2
    const config: GenerateRandomFlameConfig = {
      strength: ranges.strength,
      minTransforms: ranges.minTransforms,
      maxTransforms: ranges.maxTransforms,
      minVariations: ranges.minVariations,
      maxVariations: ranges.maxVariations,
      allowedVariations: [],
      dimensions: dims,
    }

    const seed = resolveSeed(rawInput?.seed)

    try {
      executeCommand('flame.randomize', ctx, seed, config)
      return { success: true, seed }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}
