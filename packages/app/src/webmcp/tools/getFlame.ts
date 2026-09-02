import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { WebMcpTool } from '@/webmcp/types'

const MAX_SHOWN_TRANSFORMS = 8

export const getFlame: WebMcpTool = {
  name: 'get_flame',
  description:
    'Get a compact summary of the active flame fractal. Returns transform count, variation types and weights per transform, render settings (exposure, gamma, vibrancy, contrast, draw mode, dimensions), and color info. Use this to understand the current state before making changes.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: () => {
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

    const transformEntries = Object.entries(flame.transforms ?? {})
    const transformCount = transformEntries.length
    const truncated = transformCount > MAX_SHOWN_TRANSFORMS
    const shownEntries = transformEntries.slice(0, MAX_SHOWN_TRANSFORMS)

    const transforms = shownEntries.map(([id, transform]) => {
      const variations = Object.values(transform.variations ?? {}).map((v) => ({
        type: v.type,
        weight: v.weight,
      }))

      return {
        id,
        probability: transform.probability,
        variations,
        color: {
          x: transform.color?.x ?? 0,
          y: transform.color?.y ?? 0,
        },
        colorSpeed: transform.colorSpeed ?? 0.4,
        visible: transform.visible ?? true,
      }
    })

    const renderSettings = {
      dimensions: flame.renderSettings?.dimensions ?? 2,
      exposure: flame.renderSettings?.exposure ?? 0.25,
      gamma: flame.renderSettings?.gamma ?? 2.2,
      vibrancy: flame.renderSettings?.vibrancy ?? 0.5,
      contrast: flame.renderSettings?.contrast ?? 1,
      drawMode: flame.renderSettings?.drawMode ?? 'light',
      backgroundColor: flame.renderSettings?.backgroundColor ?? [0, 0, 0],
      skipIters: flame.renderSettings?.skipIters ?? 20,
    }

    const metadata = {
      name: flame.metadata?.name ?? '',
      author: flame.metadata?.author ?? 'unknown',
      description: flame.metadata?.description ?? '',
    }

    return {
      transformCount,
      ...(truncated
        ? { truncated: true, shownTransforms: MAX_SHOWN_TRANSFORMS }
        : {}),
      transforms,
      renderSettings,
      metadata,
    }
  },
}
