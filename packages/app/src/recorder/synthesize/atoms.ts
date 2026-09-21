import { isSafeFlameEntityId, renderSettingsDefault, } from '@/flame/schema/flameSchema'
import { isVariationTypeFor } from '@/flame/variationRegistry'
import { canonicallyEqual } from './canonical'
import type { CanonicalFlame } from './canonical'
import type { FlameDescriptor, TransformFunction, TransformId, VariationId, } from '@/flame/schema/flameSchema'
import type { Dims } from '@/flame/variationRegistry'

/**
 * One thing that happens in a synthesized creation: exactly one existing,
 * replayable command, plus what it is supposed to achieve.
 *
 * The planner never assumes what a command did — it runs the command in the
 * sandbox and re-reads the document. So an atom carries a `read`/`expected`
 * pair rather than a patch: before the step runs, an atom whose value is
 * already right is a no-op and is dropped, and after the whole plan runs the
 * same pairs say what is still wrong. This is what makes "the transform
 * already has an identity pre-affine" and "this weight is already 1" disappear
 * from the step list without a table of per-command defaults to keep in sync.
 */
export type Atom = {
  /** Registry command id — always one that exists and is replayable. */
  readonly id: string
  /** Canonical args, the exact form the replay path receives. */
  readonly args: readonly unknown[]
  /** What this atom makes true; also its name in `needs`. */
  readonly key: string
  /** Keys this atom brings into existence besides its own. */
  readonly provides?: readonly string[]
  /** Keys that must already have run before this one can. */
  readonly needs?: readonly string[]
  readonly group: AtomGroup
  /** Which transform this belongs to, in target order. */
  readonly transformIndex?: number
  /** How loud the change is — variations are built loudest-first. */
  readonly prominence?: number
  readonly read: (flame: FlameDescriptor) => unknown
  readonly expected: unknown
}

export type AtomGroup =
  | 'stage'
  | 'palette'
  | 'structure'
  | 'shape'
  | 'variation'
  | 'colour'
  | 'render'
  | 'camera'
  | 'final'

export function isAtomSatisfied(atom: Atom, flame: FlameDescriptor): boolean {
  return canonicallyEqual(atom.read(flame), atom.expected)
}

const STAGE_CLEAR = 'stage:clear'
const STAGE_DIMENSIONS = 'stage:dimensions'
const PALETTE_KEY = 'palette'

/** Render-setting paths that are NOT reachable through `flame.setRenderSetting`
 *  and have a command of their own instead. */
const NON_PATH_SETTINGS = new Set([
  'palette',
  'blendFlame',
  'blendWeight',
  // `edgeFadeColor` is the one render setting with neither a schema default
  // nor a command: it can only be reached by the final snap. Listed here so
  // the planner does not emit a `setRenderSetting` the registry would refuse.
  'edgeFadeColor',
])

/**
 * Every settable leaf of the render settings, as dotted paths.
 *
 * Derived from `renderSettingsDefault` because that is exactly the vocabulary
 * `flame.setRenderSetting` accepts (it resolves the path against the same
 * object); a hand-written list here would be a second copy to keep in sync
 * with a schema that gains settings.
 */
export function renderSettingPaths(): string[] {
  const paths: string[] = []
  const walk = (node: unknown, prefix: string) => {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) {
      if (prefix !== '') paths.push(prefix)
      return
    }
    for (const [key, value] of Object.entries(node)) {
      walk(value, prefix === '' ? key : `${prefix}.${key}`)
    }
  }
  walk(renderSettingsDefault, '')
  return paths.filter(
    (path) => !NON_PATH_SETTINGS.has(path.split('.')[0] ?? ''),
  )
}

/**
 * Entity records are keyed by branded ids, while an atom addresses its target
 * by the plain string it will put in the session file. These two helpers are
 * the only place that gap is crossed, and they cross it after the id has
 * already passed `isSafeFlameEntityId`.
 */
function transformAt(
  flame: FlameDescriptor,
  transformId: string,
): TransformFunction | undefined {
  return flame.transforms[transformId as TransformId]
}

function variationAt(
  flame: FlameDescriptor,
  transformId: string,
  variationId: string,
): TransformFunction['variations'][VariationId] | undefined {
  return transformAt(flame, transformId)?.variations[variationId as VariationId]
}

function atPath(root: unknown, path: string): unknown {
  let node: unknown = root
  for (const segment of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[segment]
  }
  return node
}

const CAMERA_PATHS = /^camera(3D)?\./

/**
 * Turn a target flame into the unordered set of one-command steps that build
 * it from the app's default new flame.
 *
 * Unordered on purpose: what makes a journey watchable is the ORDER, and that
 * is the strategy's job (see strategies.ts). This module only answers "what
 * has to happen at all", and answers it in exactly one vocabulary — commands
 * that already exist, with the argument shapes the registry already validates.
 */
export function buildAtoms(target: CanonicalFlame): {
  atoms: Atom[]
  /** Target state no atom can express; the snap step's job. */
  unreachable: string[]
} {
  const atoms: Atom[] = []
  const unreachable: string[] = []
  const dims: Dims = target.renderSettings.dimensions === 3 ? 3 : 2

  atoms.push({
    id: 'flame.clearTransforms',
    args: [],
    key: STAGE_CLEAR,
    group: 'stage',
    read: (flame) => Object.keys(flame.transforms).length,
    expected: 0,
  })

  if (dims === 3) {
    atoms.push({
      id: 'flame.setRenderSetting',
      args: ['dimensions', 3],
      key: STAGE_DIMENSIONS,
      group: 'stage',
      needs: [STAGE_CLEAR],
      read: (flame) => flame.renderSettings.dimensions,
      expected: 3,
    })
  }
  const stageKeys = dims === 3 ? [STAGE_CLEAR, STAGE_DIMENSIONS] : [STAGE_CLEAR]

  const palette = target.renderSettings.palette
  if (palette !== undefined) {
    atoms.push({
      id: 'flame.applyPalette',
      args: [palette],
      key: PALETTE_KEY,
      group: 'palette',
      needs: stageKeys,
      read: (flame) => flame.renderSettings.palette,
      expected: palette,
    })
  }

  transformAtoms(
    target,
    dims,
    stageKeys,
    palette !== undefined,
    atoms,
    unreachable,
  )
  renderAtoms(target, stageKeys, atoms)

  if (target.finalTransform !== undefined) {
    atoms.push({
      id: 'flame.setFinalTransform',
      args: [target.finalTransform],
      key: 'final',
      group: 'final',
      needs: stageKeys,
      read: (flame) => flame.finalTransform,
      expected: target.finalTransform,
    })
  }

  return { atoms, unreachable }
}

function transformAtoms(
  target: CanonicalFlame,
  dims: Dims,
  stageKeys: readonly string[],
  hasPalette: boolean,
  atoms: Atom[],
  unreachable: string[],
): void {
  const entries = Object.entries(target.transforms)
  for (const [index, [transformId, transform]] of entries.entries()) {
    const variations = Object.entries(transform.variations)
    const [firstVariation] = variations
    // `flame.addTransform` refuses the reserved `_sym__` prefix — those
    // transforms belong to `flame.applySymmetry`, which mints its own ids and
    // cannot be asked to reproduce an arbitrary set. They are snapped.
    if (!isSafeFlameEntityId(transformId) || transformId.startsWith('_sym__')) {
      unreachable.push(`transforms.${transformId}`)
      continue
    }
    if (firstVariation === undefined) {
      // The schema allows it; no command can build a transform without one.
      unreachable.push(`transforms.${transformId}.variations`)
      continue
    }
    const [firstVariationId, firstVariationDescriptor] = firstVariation
    const seedType = isVariationTypeFor(dims, firstVariationDescriptor.type)
      ? firstVariationDescriptor.type
      : undefined
    if (seedType === undefined || !isSafeFlameEntityId(firstVariationId)) {
      unreachable.push(
        `transforms.${transformId}.variations.${firstVariationId}`,
      )
      continue
    }

    const txKey = `tx:${transformId}`
    const firstVarKey = `var:${transformId}:${firstVariationId}`
    atoms.push({
      id: 'flame.addTransform',
      args: [seedType, transformId, firstVariationId],
      key: txKey,
      provides: [firstVarKey],
      group: 'structure',
      transformIndex: index,
      needs: stageKeys,
      read: (flame) => Object.hasOwn(flame.transforms, transformId),
      expected: true,
    })

    for (const which of ['pre', 'post'] as const) {
      const affine =
        which === 'pre' ? transform.preAffine : transform.postAffine
      atoms.push({
        id: 'flame.setTransformAffine',
        args: [transformId, which, affine],
        key: `affine:${transformId}:${which}`,
        group: 'shape',
        transformIndex: index,
        needs: [txKey],
        read: (flame) =>
          which === 'pre'
            ? transformAt(flame, transformId)?.preAffine
            : transformAt(flame, transformId)?.postAffine,
        expected: affine,
      })
    }

    atoms.push({
      id: 'flame.setProbability',
      args: [transformId, transform.probability],
      key: `probability:${transformId}`,
      group: 'shape',
      transformIndex: index,
      needs: [txKey],
      read: (flame) => transformAt(flame, transformId)?.probability,
      expected: transform.probability,
    })

    atoms.push({
      id: 'flame.setColorSpeed',
      args: [transformId, transform.colorSpeed],
      key: `colorSpeed:${transformId}`,
      group: 'colour',
      transformIndex: index,
      needs: [txKey],
      read: (flame) => transformAt(flame, transformId)?.colorSpeed,
      expected: transform.colorSpeed,
    })

    atoms.push({
      id: 'flame.setTransformColor',
      args: [transformId, transform.color.x, transform.color.y],
      key: `color:${transformId}`,
      group: 'colour',
      transformIndex: index,
      // A palette recolours every transform, so it can never land after the
      // colours it would overwrite.
      needs: hasPalette ? [txKey, PALETTE_KEY] : [txKey],
      read: (flame) => transformAt(flame, transformId)?.color,
      expected: transform.color,
    })

    if (!transform.visible) {
      atoms.push({
        id: 'flame.setTransformVisible',
        args: [transformId, false],
        key: `visible:${transformId}`,
        group: 'shape',
        transformIndex: index,
        needs: [txKey],
        read: (flame) => transformAt(flame, transformId)?.visible,
        expected: false,
      })
    }

    for (const [
      variationIndex,
      [variationId, descriptor],
    ] of variations.entries()) {
      variationAtoms({
        atoms,
        unreachable,
        dims,
        transformId,
        transformIndex: index,
        txKey,
        variationId,
        descriptor,
        // The first variation arrives with the transform.
        created: variationIndex === 0,
      })
    }
  }
}

type VariationAtomInput = {
  atoms: Atom[]
  unreachable: string[]
  dims: Dims
  transformId: string
  transformIndex: number
  txKey: string
  variationId: string
  descriptor: TransformFunction['variations'][VariationId]
  created: boolean
}

/**
 * A variation, built the way the editor builds one: add it, then move its
 * weight, then its parameters, then its visibility.
 *
 * Decomposed rather than written wholesale with `flame.setVariation` because
 * a weight IS the thing the viewer should see move. The wholesale command is
 * the fallback for a descriptor the per-field commands cannot express (a
 * parameter the type's defaults do not carry, or a non-numeric one).
 */
function variationAtoms(input: VariationAtomInput): void {
  const {
    atoms,
    unreachable,
    dims,
    transformId,
    transformIndex,
    txKey,
    variationId,
    descriptor,
    created,
  } = input
  const varKey = `var:${transformId}:${variationId}`
  if (
    !isSafeFlameEntityId(variationId) ||
    !isVariationTypeFor(dims, descriptor.type)
  ) {
    unreachable.push(`transforms.${transformId}.variations.${variationId}`)
    return
  }
  if (!created) {
    atoms.push({
      id: 'flame.addVariation',
      args: [transformId, descriptor.type, variationId],
      key: varKey,
      group: 'structure',
      transformIndex,
      needs: [txKey],
      read: (flame) => variationAt(flame, transformId, variationId)?.type,
      expected: descriptor.type,
    })
  }

  const prominence = descriptor.weight
  atoms.push({
    id: 'flame.setVariationWeight',
    args: [transformId, variationId, descriptor.weight],
    key: `weight:${varKey}`,
    group: 'variation',
    transformIndex,
    prominence,
    needs: [varKey],
    read: (flame) => variationAt(flame, transformId, variationId)?.weight,
    expected: descriptor.weight,
  })

  const params = (descriptor as { params?: Record<string, unknown> }).params
  if (params !== undefined) {
    const numeric = Object.entries(params).filter(
      ([, value]) => typeof value === 'number' && Number.isFinite(value),
    )
    if (numeric.length !== Object.keys(params).length) {
      // Something the per-parameter command cannot carry — replace the whole
      // descriptor instead of pretending the parameters were typed in.
      atoms.push({
        id: 'flame.setVariation',
        args: [transformId, variationId, descriptor],
        key: `descriptor:${varKey}`,
        group: 'variation',
        transformIndex,
        prominence,
        needs: [varKey],
        read: (flame) => variationAt(flame, transformId, variationId),
        expected: descriptor,
      })
    } else {
      for (const [name, value] of numeric) {
        atoms.push({
          id: 'flame.setVariationParams',
          args: [transformId, variationId, name, value],
          key: `param:${varKey}:${name}`,
          group: 'variation',
          transformIndex,
          prominence,
          needs: [varKey],
          read: (flame) =>
            (
              variationAt(flame, transformId, variationId) as
                | { params?: Record<string, unknown> }
                | undefined
            )?.params?.[name],
          expected: value,
        })
      }
    }
  }

  if (!descriptor.visible) {
    atoms.push({
      id: 'flame.setVariationVisible',
      args: [transformId, variationId, false],
      key: `visible:${varKey}`,
      group: 'variation',
      transformIndex,
      prominence,
      needs: [varKey],
      read: (flame) => variationAt(flame, transformId, variationId)?.visible,
      expected: false,
    })
  }
}

function renderAtoms(
  target: CanonicalFlame,
  stageKeys: readonly string[],
  atoms: Atom[],
): void {
  const settings = target.renderSettings as unknown as Record<string, unknown>
  for (const path of renderSettingPaths()) {
    // `dimensions` is already a staging step: transforms cannot be added in
    // the wrong dimension, so it cannot wait for the render pass.
    if (path === 'dimensions') continue
    const value = atPath(settings, path)
    // Only the background may be cleared back to Auto; every other setting the
    // target somehow lacks stays as the base had it and is reported as
    // residual rather than written as a refused `null`.
    if (value === undefined && path !== 'backgroundColor') continue
    atoms.push({
      id: 'flame.setRenderSetting',
      // An optional setting the target omits is CLEARED, not left at whatever
      // the base had. `null` is the command's own word for that, and the
      // registry allows it for the one clearable setting.
      args: [path, value === undefined ? null : value],
      key: `render:${path}`,
      group: CAMERA_PATHS.test(path) ? 'camera' : 'render',
      needs: stageKeys,
      read: (flame) => atPath(flame.renderSettings, path),
      expected: value,
    })
  }

  const blendWeight = target.renderSettings.blendWeight
  if (blendWeight !== undefined) {
    atoms.push({
      id: 'flame.setBlendWeight',
      args: [blendWeight],
      key: 'render:blendWeight',
      group: 'render',
      needs: stageKeys,
      read: (flame) => flame.renderSettings.blendWeight,
      expected: blendWeight,
    })
  }
  const blendFlame = target.renderSettings.blendFlame
  if (blendFlame !== undefined) {
    atoms.push({
      id: 'flame.setBlendFlame',
      args: [blendFlame],
      key: 'render:blendFlame',
      group: 'render',
      needs: stageKeys,
      read: (flame) => flame.renderSettings.blendFlame,
      expected: blendFlame,
    })
  }
}
