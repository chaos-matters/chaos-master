import type { FlameDescriptor, TransformFunction, } from '@/flame/schema/flameSchema'
import type { WebMcpTool } from '@/webmcp/types'

function translateTransform(t: TransformFunction, dx: number, dy: number) {
  // Deep clone to avoid mutating the original
  const clone = JSON.parse(JSON.stringify(t))

  // We apply the translation to the postAffine so that it moves the entire shape
  if (clone.postAffine) {
    clone.postAffine.e = (clone.postAffine.e || 0) + dx
    clone.postAffine.f = (clone.postAffine.f || 0) + dy
  }
  return clone
}

export const createClashFlame: WebMcpTool = {
  name: 'create_clash_flame',
  description:
    'Merges two flames into a single arena view, positioning them side-by-side. Useful for Flame Clash battles. Returns the combined flame descriptor which you can then apply using set_flame.',
  inputSchema: {
    type: 'object',
    properties: {
      flameA: {
        type: 'object',
        description:
          'The first flame descriptor (Player 1). Will be positioned on the left.',
      },
      flameB: {
        type: 'object',
        description:
          'The second flame descriptor (Player 2). Will be positioned on the right.',
      },
      distance: {
        type: 'number',
        description: 'Distance between the two flames. Default is 2.0.',
      },
    },
    required: ['flameA', 'flameB'],
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: (input: unknown) => {
    const {
      flameA,
      flameB,
      distance = 2.0,
    } = input as {
      flameA: FlameDescriptor
      flameB: FlameDescriptor
      distance?: number
    }

    if (!flameA || !flameB) {
      return { error: 'Both flameA and flameB must be provided.' }
    }

    const combinedTransforms: Record<string, TransformFunction> = {}

    // Add Player 1 transforms (shifted left)
    Object.entries(flameA.transforms || {}).forEach(([id, t], idx) => {
      combinedTransforms[`p1_${id}_${idx}`] = translateTransform(
        t,
        -distance,
        0,
      )
    })

    // Add Player 2 transforms (shifted right)
    Object.entries(flameB.transforms || {}).forEach(([id, t], idx) => {
      combinedTransforms[`p2_${id}_${idx}`] = translateTransform(t, distance, 0)
    })

    // Average the render settings
    const rsA = flameA.renderSettings || {}
    const rsB = flameB.renderSettings || {}

    const clashFlame: FlameDescriptor = {
      version: flameA.version,
      metadata: {
        name: `Clash: ${flameA.metadata?.name || 'P1'} vs ${flameB.metadata?.name || 'P2'}`,
        author: 'Arena Director',
        description: 'A combined arena view of two colliding flames.',
      },
      renderSettings: {
        ...rsA,
        exposure: Math.max(rsA.exposure || 0, rsB.exposure || 0),
        vibrancy: Math.max(rsA.vibrancy || 0, rsB.vibrancy || 0),
        camera: {
          zoom: Math.min(rsA.camera?.zoom || 1, rsB.camera?.zoom || 1) * 0.5, // Zoom out to see both
          position: [0, 0],
          rotation: 0,
        },
      },
      transforms: combinedTransforms,
    }

    return {
      success: true,
      clashFlame,
    }
  },
}
