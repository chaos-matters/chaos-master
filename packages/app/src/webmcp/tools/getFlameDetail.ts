import { deepClone } from '@/utils/clone'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { WebMcpTool } from '@/webmcp/types'

export const getFlameDetail: WebMcpTool = {
  name: 'get_flame_detail',
  description:
    'Get detailed data for a specific part of the flame. Specify section: "transform" (with transformId or index), "render" for all render settings, or "full" for the complete descriptor. Use for precise inspection before targeted edits.',
  inputSchema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        enum: ['transform', 'render', 'full'],
        description:
          'Section of the flame to retrieve: "transform", "render", or "full".',
      },
      transformId: {
        type: 'string',
        description:
          'Transform ID or 0-based index. Required when section is transform.',
      },
    },
    required: ['section'],
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: (input: unknown) => {
    const ctx = getWebMcpContext()
    if (!ctx) {
      return {
        error:
          'No active workspace context available. The application may still be loading or unmounted.',
      }
    }

    const flame = ctx.flameDescriptor()
    if (!flame) {
      return {
        error: 'No active flame descriptor found in workspace context.',
      }
    }

    const rawInput = input as
      | { section?: string; transformId?: string }
      | undefined
    const section = rawInput?.section

    if (
      !section ||
      (section !== 'transform' && section !== 'render' && section !== 'full')
    ) {
      return {
        error: `Invalid or missing section "${String(section)}". Valid options are: "transform", "render", "full".`,
      }
    }

    if (section === 'full') {
      return deepClone(flame)
    }

    if (section === 'render') {
      return {
        renderSettings: deepClone(flame.renderSettings ?? {}),
      }
    }

    if (section === 'transform') {
      const transformId = rawInput?.transformId
      if (
        transformId === undefined ||
        transformId === null ||
        transformId === ''
      ) {
        return {
          error:
            'Parameter "transformId" is required when section is "transform". Provide a transform ID string or 0-based numeric index.',
        }
      }

      const transforms = flame.transforms ?? {}
      const entries = Object.entries(transforms)

      if (Object.hasOwn(transforms, transformId)) {
        return {
          transformId,
          transform: deepClone(
            transforms[transformId as keyof typeof transforms],
          ),
        }
      }

      const parsedIndex = Number(transformId)
      if (
        !Number.isNaN(parsedIndex) &&
        Number.isInteger(parsedIndex) &&
        parsedIndex >= 0 &&
        parsedIndex < entries.length
      ) {
        const entry = entries[parsedIndex]
        if (entry) {
          return {
            transformId: entry[0],
            index: parsedIndex,
            transform: deepClone(entry[1]),
          }
        }
      }

      const availableIds = Object.keys(transforms)
      return {
        error: `Transform "${transformId}" not found. Available transform IDs: [${availableIds.join(', ')}] (total: ${availableIds.length}, indices: 0..${Math.max(0, availableIds.length - 1)}).`,
      }
    }

    return {
      error: `Unhandled section "${String(section)}".`,
    }
  },
}
