import { deepClone } from '@/utils/clone'
import { calculateFlameStats } from '@/webmcp/tools/scoreFlame'
import type { FlameDescriptor, TransformFunction, } from '@/flame/schema/flameSchema'
import type { WebMcpTool } from '@/webmcp/types'

function translateTransform2D(t: TransformFunction, dx: number, dy: number) {
  const clone = deepClone(t)
  if (clone.postAffine) {
    clone.postAffine.c = (clone.postAffine.c || 0) + dx
    clone.postAffine.f = (clone.postAffine.f || 0) + dy
  }
  return clone
}

function upgradeAffineTo3D(
  affine: Record<string, number> = {},
  dx = 0,
  dy = 0,
  dz = 0,
) {
  const is2D =
    affine.g === undefined && affine.h === undefined && affine.l === undefined
  if (is2D) {
    return {
      a: affine.a ?? 1,
      b: affine.b ?? 0,
      c: 0,
      d: (affine.c ?? 0) + dx,
      e: affine.d ?? 0,
      f: affine.e ?? 1,
      g: 0,
      h: (affine.f ?? 0) + dy,
      i: 0,
      j: 0,
      k: 1,
      l: dz,
    }
  }
  return {
    ...affine,
    d: (affine.d || 0) + dx,
    h: (affine.h || 0) + dy,
    l: (affine.l || 0) + dz,
  }
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

  const is2DPre = (clone.preAffine as Record<string, number>)?.l === undefined
  const is2DPost = (clone.postAffine as Record<string, number>)?.l === undefined

  clone.preAffine = upgradeAffineTo3D(
    clone.preAffine,
    0,
    0,
    0,
  ) as typeof clone.preAffine
  clone.postAffine = upgradeAffineTo3D(
    clone.postAffine,
    dx,
    dy,
    dz,
  ) as typeof clone.postAffine

  // Dev only: this runs once per transform, twice per clash, so a 6-vs-6 duel
  // prints a dozen affine dumps. `import.meta.env.DEV` is statically replaced
  // with `false` in production, so the whole block — strings included — is
  // dropped from the bundle rather than merely skipped at runtime.
  if (import.meta.env.DEV) {
    console.info(
      `[Arena 3D Upgrade] Translating transform (dx:${dx}, dy:${dy}, dz:${dz}).
  - preAffine upgraded from 2D? ${is2DPre} => `,
      clone.preAffine,
      `
  - postAffine upgraded from 2D? ${is2DPost} => `,
      clone.postAffine,
    )
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

export interface PowerSplitResult {
  splitA: number
  splitB: number
  sumA: number
  sumB: number
}

export function calculatePowerSplit(
  flameA: FlameDescriptor,
  flameB: FlameDescriptor,
  powerA?: number,
  powerB?: number,
): PowerSplitResult {
  const pA =
    powerA !== undefined ? powerA : calculateFlameStats(flameA).powerLevel || 1
  const pB =
    powerB !== undefined ? powerB : calculateFlameStats(flameB).powerLevel || 1
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

  return { splitA, splitB, sumA, sumB }
}

function getAxisOffsets(axis: 'x' | 'y' | 'z', separation: number) {
  return {
    dxA: axis === 'x' ? -separation : 0,
    dyA: axis === 'y' ? -separation : 0,
    dzA: axis === 'z' ? -separation : 0,
    dxB: axis === 'x' ? separation : 0,
    dyB: axis === 'y' ? separation : 0,
    dzB: axis === 'z' ? separation : 0,
  }
}

function populate3DTransforms(
  transforms: Record<string, TransformFunction> | undefined,
  prefix: 'p1' | 'p2',
  dx: number,
  dy: number,
  dz: number,
  baseTint: number,
  tintMode: 'override' | 'blend' | 'none',
  sumProb: number,
  split: number,
  outTransforms: Record<string, TransformFunction>,
) {
  Object.entries(transforms || {}).forEach(([id, t], idx) => {
    const spread = ((idx % 3) - 1) * 0.04
    const scaledProb = ((t.probability ?? 1) / sumProb) * (2 * split)
    const transformed = translateTransform3D(
      t,
      dx,
      dy,
      dz,
      Math.max(0, Math.min(1, baseTint + spread)),
      tintMode,
    )
    transformed.probability = scaledProb
    outTransforms[`${prefix}_${id}_${idx}`] = transformed
  })
}

function populate2DTransforms(
  transforms: Record<string, TransformFunction> | undefined,
  prefix: 'p1' | 'p2',
  distance: number,
  sumProb: number,
  split: number,
  outTransforms: Record<string, TransformFunction>,
) {
  Object.entries(transforms || {}).forEach(([id, t], idx) => {
    const scaledProb = ((t.probability ?? 1) / sumProb) * (2 * split)
    const transformed = translateTransform2D(t, distance, 0)
    transformed.probability = scaledProb
    outTransforms[`${prefix}_${id}_${idx}`] = transformed
  })
}

export function build3DClashFlame(
  flameA: FlameDescriptor,
  flameB: FlameDescriptor,
  axis: 'x' | 'y' | 'z',
  separation: number,
  tintA: number,
  tintB: number,
  tintMode: 'override' | 'blend' | 'none',
  powerSplit: PowerSplitResult,
): FlameDescriptor {
  const combinedTransforms: Record<string, TransformFunction> = {}
  const { dxA, dyA, dzA, dxB, dyB, dzB } = getAxisOffsets(axis, separation)

  populate3DTransforms(
    flameA.transforms,
    'p1',
    dxA,
    dyA,
    dzA,
    tintA,
    tintMode,
    powerSplit.sumA,
    powerSplit.splitA,
    combinedTransforms,
  )

  populate3DTransforms(
    flameB.transforms,
    'p2',
    dxB,
    dyB,
    dzB,
    tintB,
    tintMode,
    powerSplit.sumB,
    powerSplit.splitB,
    combinedTransforms,
  )

  const rsA = flameA.renderSettings || {}
  const rsB = flameB.renderSettings || {}

  return {
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
        radius: Math.max(3.0, separation * 3),
        target: [0, 0, 0],
        fov: 60,
        roll: 0,
      },
    },
    transforms: combinedTransforms,
  }
}

export function build2DClashFlame(
  flameA: FlameDescriptor,
  flameB: FlameDescriptor,
  distance: number,
  powerSplit: PowerSplitResult,
): FlameDescriptor {
  const combinedTransforms: Record<string, TransformFunction> = {}

  populate2DTransforms(
    flameA.transforms,
    'p1',
    -distance,
    powerSplit.sumA,
    powerSplit.splitA,
    combinedTransforms,
  )

  populate2DTransforms(
    flameB.transforms,
    'p2',
    distance,
    powerSplit.sumB,
    powerSplit.splitB,
    combinedTransforms,
  )

  const rsA = flameA.renderSettings || {}
  const rsB = flameB.renderSettings || {}

  return {
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
}

export interface ParsedCreateClashParams {
  flameA: FlameDescriptor
  flameB: FlameDescriptor
  dimensions: 2 | 3
  axis: 'x' | 'y' | 'z'
  separation: number
  distance: number
  tintA: number
  tintB: number
  tint: 'override' | 'blend' | 'none'
  powerA?: number
  powerB?: number
}

export function parseCreateClashInput(
  input: unknown,
): ParsedCreateClashParams | { error: string } {
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

  if (!raw.flameA || !raw.flameB) {
    return { error: 'Both flameA and flameB must be provided.' }
  }

  const dimensions = raw.dimensions ?? 2
  const distance = raw.distance ?? 2.0
  const separation = raw.separation ?? raw.distance ?? 2.2
  const tint = raw.tint ?? (dimensions === 3 ? 'override' : 'none')

  return {
    flameA: raw.flameA,
    flameB: raw.flameB,
    dimensions,
    axis: raw.axis ?? 'x',
    separation,
    distance,
    tintA: raw.tintA ?? 0.15,
    tintB: raw.tintB ?? 0.65,
    tint,
    powerA: raw.powerA,
    powerB: raw.powerB,
  }
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
    const parsed = parseCreateClashInput(input)
    if ('error' in parsed) {
      return parsed
    }

    const powerSplit = calculatePowerSplit(
      parsed.flameA,
      parsed.flameB,
      parsed.powerA,
      parsed.powerB,
    )

    const clashFlame =
      parsed.dimensions === 3
        ? build3DClashFlame(
            parsed.flameA,
            parsed.flameB,
            parsed.axis,
            parsed.separation,
            parsed.tintA,
            parsed.tintB,
            parsed.tint,
            powerSplit,
          )
        : build2DClashFlame(
            parsed.flameA,
            parsed.flameB,
            parsed.distance,
            powerSplit,
          )

    return {
      success: true,
      clashFlame,
    }
  },
}
