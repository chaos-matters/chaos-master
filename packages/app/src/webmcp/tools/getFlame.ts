import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { FlameDescriptor, RenderSettings, TransformFunction, } from '@/flame/schema/flameSchema'
import type { WebMcpTool } from '@/webmcp/types'

const MAX_SHOWN_TRANSFORMS = 8

export function formatTransformSummary(
  id: string,
  transform: TransformFunction,
) {
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
}

export function formatSummarizedTransforms(
  transformsRecord?: Record<string, TransformFunction>,
) {
  const entries = Object.entries(transformsRecord ?? {})
  const transformCount = entries.length
  const truncated = transformCount > MAX_SHOWN_TRANSFORMS
  const shownEntries = entries.slice(0, MAX_SHOWN_TRANSFORMS)
  const transforms = shownEntries.map(([id, t]) =>
    formatTransformSummary(id, t),
  )

  return { transformCount, truncated, transforms }
}

function formatSummarizedCamera(camera?: RenderSettings['camera']) {
  return {
    zoom: camera?.zoom ?? 1,
    position: camera?.position ?? [0, 0],
    rotation: camera?.rotation ?? 0,
  }
}

function formatSummarizedCamera3D(c3d?: RenderSettings['camera3D']) {
  if (!c3d) return undefined
  return {
    theta: c3d.theta,
    phi: c3d.phi,
    radius: c3d.radius,
    target: c3d.target,
    fov: c3d.fov,
    roll: c3d.roll,
  }
}

function formatSummarizedDisplaySettings(rs?: Partial<RenderSettings> | null) {
  return {
    exposure: rs?.exposure ?? 0.25,
    gamma: rs?.gamma ?? 2.2,
    vibrancy: rs?.vibrancy ?? 0.5,
    contrast: rs?.contrast ?? 1,
    drawMode: rs?.drawMode ?? 'light',
    backgroundColor: rs?.backgroundColor ?? [0, 0, 0],
    skipIters: rs?.skipIters ?? 20,
  }
}

export function formatSummarizedRenderSettings(
  rs?: Partial<RenderSettings> | null,
) {
  const dimensions = rs?.dimensions ?? 2
  const camera3D =
    dimensions === 3 ? formatSummarizedCamera3D(rs?.camera3D) : undefined

  return {
    dimensions,
    camera: formatSummarizedCamera(rs?.camera),
    ...(camera3D ? { camera3D } : {}),
    ...formatSummarizedDisplaySettings(rs),
  }
}

export function formatSummarizedMetadata(
  metadata?: FlameDescriptor['metadata'],
) {
  return {
    name: metadata?.name ?? '',
    author: metadata?.author ?? 'unknown',
    description: metadata?.description ?? '',
  }
}

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

    const { transformCount, truncated, transforms } =
      formatSummarizedTransforms(flame.transforms)

    return {
      transformCount,
      ...(truncated
        ? { truncated: true, shownTransforms: MAX_SHOWN_TRANSFORMS }
        : {}),
      transforms,
      renderSettings: formatSummarizedRenderSettings(flame.renderSettings),
      metadata: formatSummarizedMetadata(flame.metadata),
    }
  },
}
