import { deepClone } from '@/utils/clone'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { WebMcpTool } from '@/webmcp/types'

export const getFlameDetail: WebMcpTool = {
  name: 'get_flame_detail',
  description:
    'Get detailed data for a specific part of the flame. Specify section: "transform" (with transformId or index), "render" for all render settings, or "full" for the complete descriptor. Use for precise inspection before targeted edits. Note that the returned camera is the base un-animated camera; Timeline animations are applied dynamically during render and do not appear here.',
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
          'Transform ID string (e.g. "_benchmark_31415_0"). Required when section is "transform" unless index is provided.',
      },
      index: {
        type: 'integer',
        description:
          '0-based positional index (0, 1, 2...). Can be used instead of transformId when section is "transform".',
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
      | { section?: string; transformId?: string | number; index?: number }
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
      const rawTarget =
        rawInput?.index !== undefined ? rawInput.index : rawInput?.transformId

      if (rawTarget === undefined || rawTarget === null || rawTarget === '') {
        return {
          error:
            'Parameter "transformId" or "index" is required when section is "transform". Provide a transform ID string or 0-based numeric index.',
        }
      }

      const transformId = String(rawTarget)

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
