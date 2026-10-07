import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { coerceFlamePayload } from '@/utils/jsonQueryParam'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * What "the same flame" means to the planner.
 *
 * `metadata` and `version` are deliberately absent: a synthesized session
 * claims to rebuild the PICTURE, and a name, an author or a schema stamp is
 * not part of it. Everything that reaches the renderer is here.
 */
export type CanonicalFlame = Pick<FlameDescriptor, 'transforms'> & {
  /** Always carries a blend weight: a missing one is 0 (see canonicalFlame). */
  renderSettings: FlameDescriptor['renderSettings'] & { blendWeight: number }
  finalTransform?: FlameDescriptor['finalTransform']
}

/**
 * Anything a flame can arrive as, reduced to one comparable value.
 *
 * Runs the descriptor through the app's own `tryValidateFlame`, which migrates
 * legacy variation names (`spherical` → `sphericalVar`), dispatches 2D vs 3D
 * so 3D affines survive, fills every schema default and drops keys the schema
 * does not know (old exports carry a stray `renderSettings.quality`). Two
 * flames that differ only in those ways are the same flame here — which is
 * what lets a 2023 PNG be compared against something the planner just built.
 * So are a missing blend weight and a weight of 0: the schema leaves the
 * weight out, and everything that draws a flame reads a missing one as 0.
 */
export function canonicalFlame(input: unknown): CanonicalFlame | undefined {
  // Cloned first: `tryValidateFlame` migrates legacy variation names IN PLACE,
  // and a function whose job is to describe a flame must not edit the caller's.
  const source =
    input !== null && typeof input === 'object' ? deepClone(input) : input
  const flame = tryValidateFlame(unwrapFlamePayload(source))
  if (flame === undefined) return undefined
  const canonical: CanonicalFlame = {
    transforms: flame.transforms,
    renderSettings: {
      ...flame.renderSettings,
      // The workspace, the renderer and both exports all read the weight as
      // `blendWeight ?? 0`, so a partner saved without one (an older touch
      // pick, an agent's one-argument call) draws at 0. The plan rebuilds it
      // with a step that names 0, since a partner step naming no weight
      // would give a document without one the default.
      blendWeight: flame.renderSettings.blendWeight ?? 0,
    },
  }
  // Absent and `undefined` are the same flame; keeping the key would make a
  // deep comparison fail against a descriptor that simply omits it.
  if (flame.finalTransform !== undefined) {
    canonical.finalTransform = flame.finalTransform
  }
  return canonical
}

/**
 * Accept every shape a flame is stored in: a bare descriptor, the
 * `{ flame, animation }` share wrapper a PNG may carry, or a full descriptor
 * that happens to have both. `coerceFlamePayload` already owns that rule —
 * but it throws and it validates, so failures come back as `undefined` here
 * and the caller decides.
 */
function unwrapFlamePayload(input: unknown): unknown {
  if (input === null || typeof input !== 'object') return input
  if ('transforms' in input) return input
  if (!('flame' in input)) return input
  try {
    return coerceFlamePayload(input).flame
  } catch {
    return input.flame
  }
}

/** Every leaf path where two canonical flames disagree, deepest first seen. */
export function diffPaths(a: unknown, b: unknown, prefix = ''): string[] {
  if (Object.is(a, b)) return []
  const bothRecords =
    a !== null &&
    b !== null &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  if (!bothRecords) {
    return jsonEqual(a, b) ? [] : [prefix === '' ? '(root)' : prefix]
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  const paths: string[] = []
  for (const key of keys) {
    paths.push(
      ...diffPaths(
        left[key],
        right[key],
        prefix === '' ? key : `${prefix}.${key}`,
      ),
    )
  }
  return paths
}

/**
 * Equal as the FILE would see them.
 *
 * A descriptor makes a JSON round trip on its way into a PNG chunk and out
 * again, so `-0` and `0` are the same number here — comparing with `Object.is`
 * alone reported a synthesized affine as residual purely because the step had
 * been through `deepClone` and the target had not.
 */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  return stableStringify(a) === stableStringify(b)
}

/** Key-order-independent JSON, so two equal records never look different. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const entries = Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
  return `{${entries.join(',')}}`
}

export function canonicallyEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b)
}
