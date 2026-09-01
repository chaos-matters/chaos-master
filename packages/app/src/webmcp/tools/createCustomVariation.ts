import { createCustomVariation, updateCustomVariation, } from '@/flame/variations/custom/CustomVariationRegistry'
import type { WebMcpTool } from '@/webmcp/types'

export const createCustomVariationTool: WebMcpTool = {
  name: 'create_custom_variation',
  description:
    'Compiles and registers a new custom math variation. Returns the generated ID on success (like "custom_e1e54335_2e3b_4431_a197_9ef33d1c0afd"), which you can then use in a flame descriptor (e.g. `variations: { "custom_e1e54335_...": { type: "custom_e1e54335_...", weight: 1.0 } }`).',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Human-readable name for the variation (e.g. "My Swirl").',
      },
      body: {
        type: 'string',
        description:
          'JavaScript-syntax expression body, transpiled to WGSL. Receives `pos` (a 2-component vector with .x and .y) and must `return` a 2-component vector built with vec2f(x, y).\n\nUse JavaScript syntax, NOT WGSL syntax:\n  - `let r = length(pos);`   NOT  `let r: f32 = length(pos);`\n  - `vec2f(a, b)`            NOT  `vec2<f32>(a, b)`\nMultiple statements are fine. Semicolons required.\n\nAvailable: sin, cos, tan, atan2, sqrt, length, abs, floor, pow, min, max, vec2f, f32, and the constants PI and EPS. `Math.*` is NOT available — call `sqrt(x)`, not `Math.sqrt(x)`.\n\nExample: `let r = length(pos); let a = atan2(pos.y, pos.x) + r; return vec2f(r*cos(a), r*sin(a));`',
      },
      wgslBody: {
        type: 'string',
        description: 'Deprecated alias for `body`.',
      },
      updateId: {
        type: 'string',
        description:
          'Optional. If you want to overwrite an existing custom variation, provide its ID here (e.g., "custom_e1e54335_2e3b_4431_a197_9ef33d1c0afd"). If omitted, a new variation is created.',
      },
    },
    required: ['name'],
  },
  execute: (input: unknown) => {
    const raw = input as {
      name?: string
      body?: string
      wgslBody?: string
      updateId?: string
    }
    const name = raw?.name
    const codeBody = raw?.body ?? raw?.wgslBody

    if (!name) {
      return { error: 'Missing required parameter "name".' }
    }
    if (!codeBody) {
      return { error: 'Missing required parameter "body".' }
    }

    const updateId = raw.updateId

    try {
      if (updateId) {
        const result = updateCustomVariation(updateId, name, codeBody)
        if (!result.success) {
          return {
            error: 'Failed to update custom variation',
            details: result.errors,
          }
        }
        return { success: true, id: result.def.id, name: result.def.name }
      } else {
        const result = createCustomVariation(name, codeBody)
        if (!result.success) {
          return {
            error: 'Failed to compile custom variation',
            details: result.errors,
          }
        }
        return { success: true, id: result.def.id, name: result.def.name }
      }
    } catch (err) {
      return {
        error: `Error creating custom variation: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}
