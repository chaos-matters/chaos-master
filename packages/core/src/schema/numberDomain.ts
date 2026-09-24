/**
 * The range each flame number may take, read off the flame schema itself.
 *
 * Interpolation does not respect a schema. Halfway between skipIters 20 and 10
 * is 15 on a keyframe and 17.67 on the frame after it, and a palette sweep
 * keyed 0 -> 1.5 passes 1.25. Such a frame renders, but it is not a flame: a
 * PNG exported from it will not open again, and a document it is written into
 * will not share. `projectFlameToSchema` puts every such number back inside
 * its domain, and nothing here names a field: a bound added to the schema is
 * honoured the day it lands.
 *
 * The projection is the one that leaves the rendered picture as it was:
 * - integer: rounded DOWN. The renderer already floors skipIters and
 *   plotsPerChain before it bakes them into the pipeline, writes paletteMode
 *   into an i32, and draws anything short of dimensions 3 in 2D, so floor is
 *   what each of them consumed from a fraction.
 * - cyclic (tagged in the schema with `v.metadata({ cyclic: true })`): wrapped
 *   into range. The colour grading pass reads palettePhase through fract() and
 *   as a rotation angle, both periodic, so 1.25 and 0.25 are the same palette.
 *   A clamp would stop the palette at the end of its range instead.
 * - otherwise: clamped to [min, max].
 */
import { FlameDescriptor, FlameDescriptor3D } from './flameSchema'

export type NumberDomain = {
  min: number
  max: number
  integer: boolean
  cyclic: boolean
}

/** Just enough of a valibot schema to walk it. */
type SchemaNode = {
  type: string
  wrapped?: SchemaNode
  entries?: Record<string, SchemaNode>
  items?: readonly SchemaNode[]
  item?: SchemaNode
  value?: SchemaNode
  pipe?: readonly {
    type: string
    requirement?: unknown
    metadata?: Record<string, unknown>
  }[]
}

const WRAPPERS = new Set([
  'optional',
  'exact_optional',
  'nullable',
  'nullish',
  'undefinedable',
  'non_optional',
  'non_nullable',
  'non_nullish',
])

function unwrap(schema: SchemaNode): SchemaNode {
  let node = schema
  while (WRAPPERS.has(node.type) && node.wrapped) node = node.wrapped
  return node
}

/**
 * The domain a number schema declares, or undefined when it declares none
 * (a bare `v.number()`, or one that only asks to be finite).
 */
export function numberDomainOf(schema: unknown): NumberDomain | undefined {
  const node = unwrap(schema as SchemaNode)
  if (node.type !== 'number') return undefined
  const domain: NumberDomain = {
    min: Number.NEGATIVE_INFINITY,
    max: Number.POSITIVE_INFINITY,
    integer: false,
    cyclic: false,
  }
  for (const action of node.pipe ?? []) {
    if (action.type === 'min_value' && typeof action.requirement === 'number') {
      domain.min = Math.max(domain.min, action.requirement)
    } else if (
      action.type === 'max_value' &&
      typeof action.requirement === 'number'
    ) {
      domain.max = Math.min(domain.max, action.requirement)
    } else if (action.type === 'integer') {
      domain.integer = true
    } else if (action.type === 'metadata' && action.metadata?.cyclic === true) {
      domain.cyclic = true
    }
  }
  if (
    domain.cyclic &&
    !(Number.isFinite(domain.min) && Number.isFinite(domain.max))
  ) {
    throw new Error('a cyclic number needs a finite minimum and maximum')
  }
  const bounded = Number.isFinite(domain.min) || Number.isFinite(domain.max)
  return bounded || domain.integer || domain.cyclic ? domain : undefined
}

/** `value` moved into `domain` the way the renderer already reads it. */
export function projectNumber(value: number, domain: NumberDomain): number {
  if (!Number.isFinite(value)) return value
  if (domain.cyclic) {
    if (value >= domain.min && value <= domain.max) return value
    const span = domain.max - domain.min
    return domain.min + ((((value - domain.min) % span) + span) % span)
  }
  const whole = domain.integer ? Math.floor(value) : value
  return Math.min(domain.max, Math.max(domain.min, whole))
}

/**
 * Where the bounded numbers are. `fields` is an object's entries or a tuple's
 * items, `each` every value of a record or item of an array. Branches with no
 * bounded number under them are dropped, so the walk visits nothing else.
 */
export type DomainPlan =
  | { kind: 'number'; domain: NumberDomain }
  | { kind: 'fields'; fields: [key: string | number, plan: DomainPlan][] }
  | { kind: 'each'; plan: DomainPlan }

function compile(schema: SchemaNode): DomainPlan | undefined {
  const node = unwrap(schema)
  const domain = numberDomainOf(node)
  if (domain) return { kind: 'number', domain }
  const children: [string | number, SchemaNode][] = node.entries
    ? Object.entries(node.entries)
    : node.items
      ? node.items.map((item, index) => [index, item])
      : []
  if (children.length > 0) {
    const fields: [string | number, DomainPlan][] = []
    for (const [key, child] of children) {
      const plan = compile(child)
      if (plan) fields.push([key, plan])
    }
    return fields.length > 0 ? { kind: 'fields', fields } : undefined
  }
  const each = node.type === 'record' ? node.value : node.item
  if (node.type === 'record' || node.type === 'array') {
    const plan = each ? compile(each) : undefined
    return plan ? { kind: 'each', plan } : undefined
  }
  return undefined
}

/**
 * `value` with every bounded number under `plan` projected.
 *
 * An object is projected in place, since the flame being projected is a
 * per-frame clone or a store draft. An array that has to change is COPIED
 * instead: a frame's colour can be the very array a keyframe holds, and
 * clamping it in place would rewrite the keyframe.
 */
function projected(plan: DomainPlan, value: unknown): unknown {
  if (plan.kind === 'number') {
    return typeof value === 'number' ? projectNumber(value, plan.domain) : value
  }
  if (typeof value !== 'object' || value === null) return value
  const source = value as Record<string | number, unknown>
  let target = source
  const children: [string | number, DomainPlan][] =
    plan.kind === 'fields'
      ? plan.fields
      : Object.keys(source).map((key) => [key, plan.plan])
  for (const [key, child] of children) {
    const current = target[key]
    const next = projected(child, current)
    // Only write what moved: the target may be a store draft, where every
    // write is a change notification.
    if (Object.is(next, current)) continue
    if (target === source && Array.isArray(source)) {
      target = [...source] as unknown as Record<string | number, unknown>
    }
    target[key] = next
  }
  return target
}

let plans: { flat: DomainPlan; spatial: DomainPlan } | undefined

/** The compiled plans for the 2D and 3D flame schemas. */
export function flameDomainPlans(): { flat: DomainPlan; spatial: DomainPlan } {
  plans ??= {
    flat: compile(FlameDescriptor)!,
    spatial: compile(FlameDescriptor3D)!,
  }
  return plans
}

/**
 * Move every number in `flame` that its schema bounds back inside the bound,
 * in place, and return it. A flame that already validates is left untouched.
 */
export function projectFlameToSchema<T>(flame: T): T {
  const dimensions = (flame as { renderSettings?: { dimensions?: unknown } })
    ?.renderSettings?.dimensions
  const { flat, spatial } = flameDomainPlans()
  projected(dimensions === 3 ? spatial : flat, flame)
  return flame
}
