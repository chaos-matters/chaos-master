import { createCustomVariation, updateCustomVariation, } from '@/flame/variations/custom/CustomVariationRegistry'
import type { WebMcpTool } from '@/webmcp/types'

export const createCustomVariationTool: WebMcpTool = {
  name: 'create_custom_variation',
  description:
    'Compiles and registers a new custom WGSL math variation. Returns the generated ID on success (like "custom_12345"), which you can then use in a flame descriptor (e.g. `variations: { "custom_12345": { type: "custom_12345", weight: 1.0 } }`).',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Human-readable name for the variation (e.g. "My Swirl").',
      },
      wgslBody: {
        type: 'string',
        description:
          'The raw WGSL shader code body. It receives `pos: vec2f` and must return a `vec2f`. Example: `return vec2f(sin(pos.x), cos(pos.y));`',
      },
      updateId: {
        type: 'string',
        description:
          'Optional. If you want to overwrite an existing custom variation, provide its ID here (e.g., "custom_12345"). If omitted, a new variation is created.',
      },
    },
    required: ['name', 'wgslBody'],
  },
  execute: (input: unknown) => {
    const { name, wgslBody, updateId } = input as {
      name: string
      wgslBody: string
      updateId?: string
    }

    try {
      if (updateId) {
        const result = updateCustomVariation(updateId, name, wgslBody)
        if (!result.success) {
          return {
            error: 'Failed to update custom variation',
            details: result.errors,
          }
        }
        return { success: true, id: result.def.id, name: result.def.name }
      } else {
        const result = createCustomVariation(name, wgslBody)
        if (!result.success) {
          return {
            error: 'Failed to compile custom variation',
            details: result.errors,
          }
        }
        return { success: true, id: result.def.id, name: result.def.name }
      }
    } catch (err: any) {
      return {
        error: `Error creating custom variation: ${err.message}`,
      }
    }
  },
}
