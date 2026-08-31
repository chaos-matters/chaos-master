import { executeCommand } from '@/commands/registry'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { GenerateRandomFlameConfig } from '@/flame/randomize'
import type { WebMcpTool } from '@/webmcp/types'

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

    const minTransforms =
      typeof rawInput?.minTransforms === 'number'
        ? Math.round(rawInput.minTransforms)
        : 2
    const maxTransforms =
      typeof rawInput?.maxTransforms === 'number'
        ? Math.round(rawInput.maxTransforms)
        : 4
    const minVariations =
      typeof rawInput?.minVariations === 'number'
        ? Math.round(rawInput.minVariations)
        : 1
    const maxVariations =
      typeof rawInput?.maxVariations === 'number'
        ? Math.round(rawInput.maxVariations)
        : 2
    const strength =
      typeof rawInput?.strength === 'number' ? rawInput.strength : 0.5

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

    const dims = (ctx.flameDescriptor().renderSettings.dimensions ?? 2) as 2 | 3
    const config: GenerateRandomFlameConfig = {
      strength,
      minTransforms,
      maxTransforms,
      minVariations,
      maxVariations,
      allowedVariations: [],
      dimensions: dims,
    }

    const seed =
      typeof rawInput?.seed === 'number' && Number.isFinite(rawInput.seed)
        ? rawInput.seed >>> 0
        : Math.floor(Math.random() * 0x1_0000_0000)

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
