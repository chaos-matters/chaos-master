/**
 * A 2D fighter entering the 3D clash (design decision D5, option c).
 *
 * Only inside the clash, a 2D variation with a 3D twin turns into that twin:
 * its twin by the stem rule (`sphericalVar` -> `spherical3D`, neither taking
 * parameters), or else the analog the 3D renderer has always drawn it as in a
 * saved 2D flame, from its table VARIATION_2D_TO_3D_MAP (`curlVar` ->
 * `curl3D`). Every other 2D variation keeps its 2D function, which the 3D
 * pipeline runs on (x, y) while z passes through. Each transform of a 2D
 * fighter is marked `from2D`, so the renderer draws its 2D variations as
 * themselves, never swapped for their analogs; a variation the 2D pipeline
 * would skip (a 3D type, an unknown name) is left out. The table is read,
 * never changed, so how a saved flame renders is untouched.
 *
 * A converting fighter enters as its flat card (the pre-affine's z row
 * zeroed, so it is exactly its 2D self lying in a plane) and inflates into its
 * 3D form as `morph` goes from 0 to 1: each converted variation fades from its
 * 2D function (weight 1 - t) to its 3D twin (weight t) while the z row scales
 * by t. Every t compiles the same shader, so the inflation costs uniforms
 * only.
 *
 * A fighter stays a flat card when nothing it has would give it depth: when
 * no variation converts, or when every twin it would get passes z through
 * unchanged, as the five in Z_TRANSPARENT_TWINS do (linear3D, swirl3D,
 * cylinder3D, bent3D and cylindrical3D). Then each point keeps the random z
 * it started with and the fighter renders as a smeared slab, the failure the
 * design measured for as-is rendering.
 */
import { affineLayoutOf } from '@/arcade/affineTerms'
import { toAffine3D, VARIATION_2D_TO_3D_MAP } from '../transformFunction3D'
import { isParametricVariationType, transformVariations } from '../variations'
import { isParametricVariationType3D, transformVariations3D, } from '../variations3D'
import type { FlameDescriptor, TransformFunction, VariationId, } from '../schema/flameSchema'
import type { Affine3 } from './placement'

/** 3D twins that leave z as it came, so they give a fighter no depth. */
export const Z_TRANSPARENT_TWINS: ReadonlySet<string> = new Set([
  'linear3D',
  'swirl3D',
  'cylinder3D',
  'bent3D',
  'cylindrical3D',
])

/** The id a converted variation's 3D twin takes beside it. */
const TWIN_SUFFIX = '_to3d'

/**
 * The 3D twin of a registered 2D variation by the stem rule, when both exist
 * and neither takes parameters (so nothing has to be translated), else
 * undefined.
 */
export function stemTwin3D(type: string): string | undefined {
  if (!type.endsWith('Var') || !Object.hasOwn(transformVariations, type)) {
    return undefined
  }
  if (isParametricVariationType(type)) return undefined
  const twin = `${type.slice(0, -'Var'.length)}3D`
  if (!Object.hasOwn(transformVariations3D, twin)) return undefined
  return isParametricVariationType3D(twin) ? undefined : twin
}

/**
 * The 3D twin a registered 2D variation turns into: its stem twin, or else
 * the analog the 3D renderer draws it as in a saved 2D flame, or undefined
 * when it has neither and keeps its 2D function. An analog may take
 * parameters its 2D variation names differently; the twin is handed the 2D
 * variation's parameters, which is how the renderer has always drawn it.
 */
export function twin3D(type: string): string | undefined {
  const stem = stemTwin3D(type)
  if (stem) return stem
  if (!Object.hasOwn(transformVariations, type)) return undefined
  return Object.hasOwn(VARIATION_2D_TO_3D_MAP, type)
    ? VARIATION_2D_TO_3D_MAP[type]
    : undefined
}

export type FighterKind = 'native3D' | 'inflates' | 'flatCard'

export type FighterForm = {
  kind: FighterKind
  /** The conversions made, as `from -> to`, each once. */
  converted: string[]
  /** The 2D types that keep their 2D function, each once. */
  kept: string[]
  finalTransform: Affine3 | undefined
  /**
   * The fighter's transforms at `morph` (0 the flat card, 1 the full 3D
   * form), with 3D affines. The ids and variation types are the same for
   * every morph; only weights and the z row move.
   */
  transformsAt: (morph: number) => Record<string, TransformFunction>
}

type Variation = TransformFunction['variations'][VariationId]

const clamp01 = (x: number) =>
  Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0

/** A variation id for the twin that no variation of the transform uses. */
function twinId(variations: Record<string, Variation>, vid: string) {
  let id = `${vid}${TWIN_SUFFIX}`
  for (let n = 2; id in variations; n++) id = `${vid}${TWIN_SUFFIX}${n}`
  return id
}

/** Whether a variation draws anything: visible, weighted, in a live map. */
const counts = (transform: TransformFunction, variation: Variation) =>
  transform.visible &&
  transform.probability > 0 &&
  variation.visible &&
  variation.weight !== 0

/**
 * An affine of `flame` as the 3D kernel's twelve numbers, read in the layout
 * `flame`'s own renderer reads it in (affineLayoutOf): on a 3D flame each in
 * its own, on a 2D flame always the 2D one, as that renderer ignores g-l.
 */
function affine3DOf(
  flame: FlameDescriptor,
  affine: Record<string, number | undefined> | undefined,
): Affine3 {
  return toAffine3D(
    affine,
    affineLayoutOf(affine, flame.renderSettings.dimensions),
  )
}

function native3D(flame: FlameDescriptor): FighterForm {
  const transforms = Object.fromEntries(
    Object.entries(flame.transforms).map(([tid, t]) => [
      tid,
      {
        ...t,
        preAffine: affine3DOf(flame, t.preAffine),
        postAffine: affine3DOf(flame, t.postAffine),
      },
    ]),
  )
  return {
    kind: 'native3D',
    converted: [],
    kept: [],
    finalTransform:
      flame.finalTransform && affine3DOf(flame, flame.finalTransform),
    transformsAt: () => transforms,
  }
}

/**
 * The variations of a 2D transform its own 2D pipeline draws. That pipeline
 * skips any other (a 3D type, an unknown name), and so does the fighter.
 */
function drawnIn2D(
  variations: TransformFunction['variations'],
): TransformFunction['variations'] {
  return Object.fromEntries(
    Object.entries(variations).filter(([, v]) =>
      Object.hasOwn(transformVariations, v.type),
    ),
  )
}

/**
 * How `flame` fights in 3D: a 3D flame as it is, a 2D one converted by the
 * stem rule and inflating from its flat card, or a 2D one that stays a flat
 * card.
 */
export function fighterForm(flame: FlameDescriptor): FighterForm {
  if (flame.renderSettings.dimensions === 3) return native3D(flame)
  const lifted = Object.entries(flame.transforms).map(([tid, t]) => ({
    tid,
    transform: {
      ...t,
      preAffine: affine3DOf(flame, t.preAffine),
      postAffine: affine3DOf(flame, t.postAffine),
      variations: drawnIn2D(t.variations),
      from2D: true as const,
    },
  }))
  const twins = new Map<string, string>()
  const kept = new Set<string>()
  let depth = false
  for (const { transform: t } of lifted) {
    for (const v of Object.values(t.variations)) {
      const twin = twin3D(v.type)
      if (!twin) {
        kept.add(v.type)
        continue
      }
      twins.set(v.type, twin)
      if (!Z_TRANSPARENT_TWINS.has(twin) && counts(t, v)) depth = true
    }
  }
  // A flat card keeps every 2D function: with no depth to gain, a twin would
  // change nothing but the cost.
  return {
    kind: depth ? 'inflates' : 'flatCard',
    converted: depth ? [...twins].map(([from, to]) => `${from} -> ${to}`) : [],
    kept: depth ? [...kept] : [...kept, ...twins.keys()],
    finalTransform:
      flame.finalTransform && affine3DOf(flame, flame.finalTransform),
    transformsAt: (morph) => {
      const t = depth ? clamp01(morph) : 0
      return Object.fromEntries(
        lifted.map(({ tid, transform }) => [
          tid,
          {
            ...transform,
            // The z row scales with the morph: 0 lays the card flat.
            preAffine: {
              ...transform.preAffine,
              i: transform.preAffine.i * t,
              j: transform.preAffine.j * t,
              k: transform.preAffine.k * t,
              l: transform.preAffine.l * t,
            },
            variations: depth
              ? withTwins(transform.variations, t)
              : transform.variations,
          },
        ]),
      )
    },
  }
}

/** Each convertible variation beside its 3D twin, cross-faded at `t`. */
function withTwins(
  variations: TransformFunction['variations'],
  t: number,
): TransformFunction['variations'] {
  const out: Record<string, Variation> = {}
  for (const [vid, v] of Object.entries(variations)) {
    const twin = twin3D(v.type)
    if (!twin) {
      out[vid] = v
      continue
    }
    out[vid] = { ...v, weight: v.weight * (1 - t) }
    out[twinId(variations, vid)] = {
      type: twin,
      weight: v.weight * t,
      visible: v.visible,
      ...(v.params && { params: v.params }),
    }
  }
  return out
}
