import { diffFlames } from '@/flame/fdiff'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { WebMcpTool } from '@/webmcp/types'

export const diffFlamesTool: WebMcpTool = {
  name: 'diff_flames',
  description:
    'Compare the current flame against a target flame descriptor. Returns overall similarity (0-100%), render settings differences, matched transform pairs with per-aspect similarity scores, and unmatched transforms. Use for iterative refinement toward a goal.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      target: {
        type: 'object',
        description: 'The target FlameDescriptor to compare against',
      },
    },
    required: ['target'],
  },
  execute: (input: unknown) => {
    const ctx = getWebMcpContext()
    if (!ctx) {
      return {
        error:
          'Workspace not ready. The flame editor has not finished loading.',
      }
    }

    const rawTarget = (input as { target?: unknown })?.target
    if (
      !rawTarget ||
      typeof rawTarget !== 'object' ||
      Array.isArray(rawTarget)
    ) {
      return { error: 'Invalid target: expected a FlameDescriptor object.' }
    }

    try {
      const currentFlame = ctx.flameDescriptor()
      const result = diffFlames(currentFlame, rawTarget as FlameDescriptor)

      return {
        overallSimilarity: result.overallSimilarity,
        renderSimilarity: result.renderSimilarity,
        renderDiffs: result.renderDiffs.filter((d) => d.similarity < 0.99),
        matchedTransforms: result.matchedTransforms,
        unmatchedInCurrent: result.unmatchedA,
        unmatchedInTarget: result.unmatchedB,
      }
    } catch (err) {
      return {
        error: `Failed to diff flames: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}
