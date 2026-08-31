import { executeCommand } from '@/commands/registry'
import { MUTATION_PRESETS } from '@/flame/randomize'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { GenerateRandomFlameConfig, MutateFlameOptions, MutationPresetName, } from '@/flame/randomize'
import type { WebMcpTool } from '@/webmcp/types'

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

    if (
      rawInput?.preset !== undefined &&
      (typeof rawInput.preset !== 'string' ||
        !(rawInput.preset in MUTATION_PRESETS))
    ) {
      return {
        error:
          'Invalid preset. Must be one of: "Subtle", "Moderate", "Chaotic", "Structural".',
      }
    }

    const mutateVariations = rawInput?.mutateVariations
    if (
      mutateVariations !== undefined &&
      mutateVariations !== 'modify' &&
      mutateVariations !== 'all' &&
      mutateVariations !== 'none'
    ) {
      return {
        error:
          'Invalid mutateVariations. Must be one of: "modify", "all", "none".',
      }
    }

    const presetName: MutationPresetName =
      typeof rawInput?.preset === 'string' &&
      rawInput.preset in MUTATION_PRESETS
        ? (rawInput.preset as MutationPresetName)
        : 'Moderate'

    const presetRates = MUTATION_PRESETS[presetName]

    const options: MutateFlameOptions = {
      mutateAffine:
        typeof rawInput?.mutateAffine === 'boolean'
          ? rawInput.mutateAffine
          : true,
      affineMode: 'smart',
      mutateVariations: mutateVariations ?? 'modify',
      mutateColors:
        typeof rawInput?.mutateColors === 'boolean'
          ? rawInput.mutateColors
          : true,
      ...presetRates,
    }

    const dims = (ctx.flameDescriptor().renderSettings.dimensions ?? 2) as 2 | 3
    const config: GenerateRandomFlameConfig = {
      strength: 0.5,
      minTransforms: 2,
      maxTransforms: 4,
      minVariations: 1,
      maxVariations: 2,
      allowedVariations: [],
      dimensions: dims,
    }

    const seed =
      typeof rawInput?.seed === 'number' && Number.isFinite(rawInput.seed)
        ? rawInput.seed >>> 0
        : Math.floor(Math.random() * 0x1_0000_0000)

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
