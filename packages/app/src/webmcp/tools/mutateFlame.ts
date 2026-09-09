import { executeCommand } from '@/commands/registry'
import { MUTATION_PRESETS } from '@/flame/randomize'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { GenerateRandomFlameConfig, MutateFlameOptions, MutationPresetName, } from '@/flame/randomize'
import type { WebMcpTool } from '@/webmcp/types'

function validateMutationParams(
  raw?: Record<string, unknown>,
): { error: string } | null {
  if (
    raw?.preset !== undefined &&
    (typeof raw.preset !== 'string' || !(raw.preset in MUTATION_PRESETS))
  ) {
    return {
      error:
        'Invalid preset. Must be one of: "Subtle", "Moderate", "Chaotic", "Structural".',
    }
  }

  const mv = raw?.mutateVariations
  if (mv !== undefined && mv !== 'modify' && mv !== 'all' && mv !== 'none') {
    return {
      error:
        'Invalid mutateVariations. Must be one of: "modify", "all", "none".',
    }
  }

  return null
}

function resolveMutationOptions(
  raw?: Record<string, unknown>,
): MutateFlameOptions {
  const presetName: MutationPresetName =
    typeof raw?.preset === 'string' && raw.preset in MUTATION_PRESETS
      ? (raw.preset as MutationPresetName)
      : 'Moderate'

  const presetRates = MUTATION_PRESETS[presetName]

  return {
    mutateAffine:
      typeof raw?.mutateAffine === 'boolean' ? raw.mutateAffine : true,
    affineMode: 'smart',
    mutateVariations:
      (raw?.mutateVariations as MutateFlameOptions['mutateVariations']) ??
      'modify',
    mutateColors:
      typeof raw?.mutateColors === 'boolean' ? raw.mutateColors : true,
    ...presetRates,
  }
}

function resolveSeed(rawSeed?: unknown): number {
  if (typeof rawSeed === 'number' && Number.isFinite(rawSeed)) {
    return rawSeed >>> 0
  }
  return Math.floor(Math.random() * 0x1_0000_0000)
}

function createMutationConfig(dimensions: number): GenerateRandomFlameConfig {
  return {
    strength: 0.5,
    minTransforms: 2,
    maxTransforms: 4,
    minVariations: 1,
    maxVariations: 2,
    allowedVariations: [],
    dimensions: dimensions === 3 ? 3 : 2,
  }
}

export const mutateFlame: WebMcpTool = {
  name: 'mutate_flame',
  description:
    'Mutate the current flame with controlled randomness. Choose a preset (Subtle, Moderate, Chaotic, Structural) or fine-tune individual rates. Deterministic per seed and input flame. Use for iterative refinement.',
  inputSchema: {
    type: 'object',
    properties: {
      seed: {
        type: 'integer',
        description: 'Random seed for reproducible mutations',
      },
      preset: {
        type: 'string',
        enum: ['Subtle', 'Moderate', 'Chaotic', 'Structural'],
        description: 'Mutation intensity preset. Default Moderate.',
      },
      mutateAffine: {
        type: 'boolean',
        description: 'Mutate affine transforms. Default true.',
      },
      mutateColors: {
        type: 'boolean',
        description: 'Mutate colors. Default true.',
      },
      mutateVariations: {
        type: 'string',
        enum: ['modify', 'all', 'none'],
        description: 'Variation mutation mode. Default modify.',
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

    const validationError = validateMutationParams(rawInput)
    if (validationError) {
      return validationError
    }

    const options = resolveMutationOptions(rawInput)
    const seed = resolveSeed(rawInput?.seed)
    const dims = ctx.flameDescriptor().renderSettings.dimensions ?? 2
    const config = createMutationConfig(dims)

    try {
      executeCommand('flame.mutate', ctx, seed, config, options)
      return { success: true, seed }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}
