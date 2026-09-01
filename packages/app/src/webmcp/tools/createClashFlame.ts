import { deepClone } from '@/utils/clone'
import type { FlameDescriptor, TransformFunction, } from '@/flame/schema/flameSchema'
import type { WebMcpTool } from '@/webmcp/types'

function translateTransform2D(t: TransformFunction, dx: number, dy: number) {
  const clone = JSON.parse(JSON.stringify(t))
  if (clone.postAffine) {
    clone.postAffine.e = (clone.postAffine.e || 0) + dx
    clone.postAffine.f = (clone.postAffine.f || 0) + dy
  }
  return clone
}

function translateTransform3D(
  t: TransformFunction,
  dx: number,
  dy: number,
  dz: number,
  tintColor?: number,
  tintMode: 'override' | 'blend' | 'none' = 'override',
) {
  const clone = deepClone(t)
  const pa = (clone.postAffine ?? {}) as Record<string, number>

  // Check if postAffine is in 2D format ({ a, b, c, d, e, f }) or 3D ({ a..l })
  const is2D = pa.g === undefined && pa.h === undefined && pa.l === undefined

  if (is2D) {
    clone.postAffine = {
      a: pa.a ?? 1,
      b: pa.b ?? 0,
      c: 0,
      d: (pa.c ?? 0) + dx,
      e: pa.d ?? 0,
      f: pa.e ?? 1,
      g: 0,
      h: (pa.f ?? 0) + dy,
      i: 0,
      j: 0,
      k: 1,
      l: dz,
    }
  } else {
    clone.postAffine = {
      ...pa,
      d: (pa.d || 0) + dx,
      h: (pa.h || 0) + dy,
      l: (pa.l || 0) + dz,
    } as unknown as typeof clone.postAffine
  }

  if (tintColor !== undefined && tintMode !== 'none') {
    const rawColor = clone.color as unknown
    const origColor =
      typeof rawColor === 'object' && rawColor !== null && 'x' in rawColor
        ? (rawColor as { x: number; y: number }).x
        : Array.isArray(rawColor)
          ? (rawColor[0] ?? 0)
          : 0
    const finalHue =
      tintMode === 'blend' ? (origColor + tintColor) / 2 : tintColor
    clone.color = { x: finalHue, y: 1.0 }
  }

  return clone
}

export const createClashFlame: WebMcpTool = {
  name: 'create_clash_flame',
  description:
    'Merges two flames into a single arena view, positioning them in a shared 2D or 3D coordinate space. In 3D mode, combatants are staged on opposite sides of the origin with distinct palette tinting and an orbital camera. Returns the combined flame descriptor.',
  inputSchema: {
    type: 'object',
    properties: {
      flameA: {
        type: 'object',
        description:
          'The first flame descriptor (Player 1). Will be positioned on the left/negative axis.',
      },
      flameB: {
        type: 'object',
        description:
          'The second flame descriptor (Player 2). Will be positioned on the right/positive axis.',
      },
      dimensions: {
        type: 'integer',
        enum: [2, 3],
        description:
          'Staging dimension: 2 for 2D side-by-side, 3 for 3D shared volume. Default is 2.',
      },
      axis: {
        type: 'string',
        enum: ['x', 'y', 'z'],
        description: 'Separation axis in 3D. Default is "x".',
      },
      separation: {
        type: 'number',
        description:
          'Distance from origin to each combatant. Default is 2.2 in 3D.',
      },
      distance: {
        type: 'number',
        description: 'Legacy distance alias for 2D separation. Default is 2.0.',
      },
      tintA: {
        type: 'number',
        description:
          'Palette hue coordinate for Player 1 (0.0–1.0). Default is 0.15.',
      },
      tintB: {
        type: 'number',
        description:
          'Palette hue coordinate for Player 2 (0.0–1.0). Default is 0.65.',
      },
      tint: {
        type: 'string',
        enum: ['override', 'blend', 'none'],
        description:
          'Tint application mode. Default is "override" in 3D and "none" in 2D.',
      },
      powerA: {
        type: 'number',
        description: 'Optional power level override for Player 1.',
      },
      powerB: {
        type: 'number',
        description: 'Optional power level override for Player 2.',
      },
    },
    required: ['flameA', 'flameB'],
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: (input: unknown) => {
    const raw = (input ?? {}) as {
      flameA?: FlameDescriptor
      flameB?: FlameDescriptor
      dimensions?: 2 | 3
      axis?: 'x' | 'y' | 'z'
      separation?: number
      distance?: number
      tintA?: number
      tintB?: number
      tint?: 'override' | 'blend' | 'none'
      powerA?: number
      powerB?: number
    }

    const {
      flameA,
      flameB,
      dimensions = 2,
      axis = 'x',
      separation = raw.distance ?? 2.2,
      distance = 2.0,
      tintA = 0.15,
      tintB = 0.65,
      tint = dimensions === 3 ? 'override' : 'none',
      powerA,
      powerB,
    } = raw

    if (!flameA || !flameB) {
      return { error: 'Both flameA and flameB must be provided.' }
    }

    const combinedTransforms: Record<string, TransformFunction> = {}
    const rsA = flameA.renderSettings || {}
    const rsB = flameB.renderSettings || {}

    // Power-weighted probability split
    const pA = powerA !== undefined ? powerA : 1
    const pB = powerB !== undefined ? powerB : 1
    const totalPower = pA + pB
    const splitA = totalPower > 0 ? pA / totalPower : 0.5
    const splitB = 1 - splitA

    const sumA =
      Object.values(flameA.transforms || {}).reduce(
        (acc, t) => acc + (t.probability ?? 1),
        0,
      ) || 1
    const sumB =
      Object.values(flameB.transforms || {}).reduce(
        (acc, t) => acc + (t.probability ?? 1),
        0,
      ) || 1

    if (dimensions === 3) {
      const sep = separation
      const dxA = axis === 'x' ? -sep : 0
      const dyA = axis === 'y' ? -sep : 0
      const dzA = axis === 'z' ? -sep : 0

      const dxB = axis === 'x' ? sep : 0
      const dyB = axis === 'y' ? sep : 0
      const dzB = axis === 'z' ? sep : 0

      Object.entries(flameA.transforms || {}).forEach(([id, t], idx) => {
        const spread = ((idx % 3) - 1) * 0.04
        const scaledProb = ((t.probability ?? 1) / sumA) * (2 * splitA)
        const transformed = translateTransform3D(
          t,
          dxA,
          dyA,
          dzA,
          Math.max(0, Math.min(1, tintA + spread)),
          tint,
        )
        transformed.probability = scaledProb
        combinedTransforms[`p1_${id}_${idx}`] = transformed
      })

      Object.entries(flameB.transforms || {}).forEach(([id, t], idx) => {
        const spread = ((idx % 3) - 1) * 0.04
        const scaledProb = ((t.probability ?? 1) / sumB) * (2 * splitB)
        const transformed = translateTransform3D(
          t,
          dxB,
          dyB,
          dzB,
          Math.max(0, Math.min(1, tintB + spread)),
          tint,
        )
        transformed.probability = scaledProb
        combinedTransforms[`p2_${id}_${idx}`] = transformed
      })

      const clashFlame: FlameDescriptor = {
        version: flameA.version,
        metadata: {
          name: `3D Clash: ${flameA.metadata?.name || 'P1'} vs ${flameB.metadata?.name || 'P2'}`,
          author: 'Arena Director',
          description: 'A 3D volumetric arena view of two colliding flames.',
        },
        renderSettings: {
          ...rsA,
          dimensions: 3,
          autoExposure3D: true,
          autoExposure3DStrength: 1,
          autoExposure3DRefRadius: 5,
          autoExposure3DBase: 0,
          depthColorPower: 0.3,
          exposure: Math.max(rsA.exposure || 0, rsB.exposure || 0, 1.2),
          vibrancy: Math.max(rsA.vibrancy || 0, rsB.vibrancy || 0),
          camera3D: {
            theta: 0,
            phi: 1.2,
            radius: Math.max(3.0, sep * 3),
            target: [0, 0, 0],
            fov: 60,
            roll: 0,
          },
        },
        transforms: combinedTransforms,
      }

      return {
        success: true,
        clashFlame,
      }
    }

    // 2D fallback path
    Object.entries(flameA.transforms || {}).forEach(([id, t], idx) => {
      const scaledProb = ((t.probability ?? 1) / sumA) * (2 * splitA)
      const transformed = translateTransform2D(t, -distance, 0)
      transformed.probability = scaledProb
      combinedTransforms[`p1_${id}_${idx}`] = transformed
    })

    Object.entries(flameB.transforms || {}).forEach(([id, t], idx) => {
      const scaledProb = ((t.probability ?? 1) / sumB) * (2 * splitB)
      const transformed = translateTransform2D(t, distance, 0)
      transformed.probability = scaledProb
      combinedTransforms[`p2_${id}_${idx}`] = transformed
    })

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
          zoom: Math.min(rsA.camera?.zoom || 1, rsB.camera?.zoom || 1) * 0.5,
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
