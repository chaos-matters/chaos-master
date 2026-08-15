/**
 * Why a value-pinned snapshot exists.
 *
 * Rich editor workflows intentionally record their finished flame/timeline
 * rather than rerunning randomness or depending on a gallery entry that may
 * later disappear. The snapshot makes replay exact; this small, validated
 * origin keeps the human meaning (caption + follow-cam target) alongside it.
 *
 * Origins are data, not executable instructions. Presentation is derived from
 * the stable `kind` here so imported sessions cannot smuggle selectors or
 * arbitrary focus hints into the replay UI.
 */

const ORIGIN_KINDS = [
  'flame.randomize',
  'flame.mutate',
  'flame.random-gallery',
  'flame.history',
  'flame.gallery',
  'flame.file',
  'flame.home',
  'flame.new',
  'flame.breed',
  'flame.evolve',
  'flame.simulator',
  'flame.ancestry',
  'flame.dimension',
  'timeline.random',
  'timeline.smart',
  'timeline.colors',
  'timeline.preset',
  'timeline.load',
  'timeline.clear',
  'timeline.morph',
  'timeline.dimension',
] as const

export type SnapshotOriginKind = (typeof ORIGIN_KINDS)[number]

export type SnapshotOrigin = {
  kind: SnapshotOriginKind
  /** Optional bounded context, e.g. a preset name or "2D"/"3D". */
  detail?: string
}

const ORIGIN_KIND_SET = new Set<string>(ORIGIN_KINDS)
const MAX_ORIGIN_DETAIL_CHARS = 160

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** Validate and canonicalize an origin crossing the untrusted session seam. */
export function tryValidateSnapshotOrigin(
  value: unknown,
): SnapshotOrigin | undefined {
  if (!isPlainRecord(value)) return undefined
  if (Object.keys(value).some((key) => key !== 'kind' && key !== 'detail')) {
    return undefined
  }
  const { kind, detail } = value
  if (typeof kind !== 'string' || !ORIGIN_KIND_SET.has(kind)) return undefined
  if (
    detail !== undefined &&
    (typeof detail !== 'string' ||
      detail.length === 0 ||
      detail.length > MAX_ORIGIN_DETAIL_CHARS)
  ) {
    return undefined
  }
  return {
    kind: kind as SnapshotOriginKind,
    ...(detail === undefined ? {} : { detail }),
  }
}

/** Typed constructor used by trusted live UI call sites. */
export function snapshotOrigin(
  kind: SnapshotOriginKind,
  detail?: string,
): SnapshotOrigin {
  return detail === undefined ? { kind } : { kind, detail }
}

function withDetail(base: string, detail: string | undefined): string {
  return detail === undefined ? base : `${base}: ${detail}`
}

/** Human caption for an exact snapshot action. */
export function snapshotOriginLabel(value: unknown): string | undefined {
  const origin = tryValidateSnapshotOrigin(value)
  if (!origin) return undefined

  switch (origin.kind) {
    case 'flame.randomize':
      return 'Randomize Flame'
    case 'flame.mutate':
      return 'Mutate Flame'
    case 'flame.random-gallery':
      return 'Apply Random Flame'
    case 'flame.history':
      return 'Load Randomizer History'
    case 'flame.gallery':
      return withDetail('Load Gallery Flame', origin.detail)
    case 'flame.file':
      // The standard Load dialog also contains built-ins and Recents. Keep the
      // caption truthful until the modal returns a more specific source.
      return withDetail('Load Flame', origin.detail)
    case 'flame.home':
      return withDetail('Open Home Flame', origin.detail)
    case 'flame.new':
      return 'New Flame'
    case 'flame.breed':
      return 'Apply Bred Flame'
    case 'flame.evolve':
      return 'Apply Evolved Flame'
    case 'flame.simulator':
      return 'Apply Simulator Flame'
    case 'flame.ancestry':
      return 'Load Ancestry Flame'
    case 'flame.dimension':
      return origin.detail === undefined
        ? 'Switch Dimensions'
        : `Switch to ${origin.detail}`
    case 'timeline.random':
      return withDetail('Random Animate', origin.detail)
    case 'timeline.smart':
      return 'Smart Animate'
    case 'timeline.colors':
      return 'Animate Colors'
    case 'timeline.preset':
      return withDetail('Apply Animation Preset', origin.detail)
    case 'timeline.load':
      return withDetail('Load Animation', origin.detail)
    case 'timeline.clear':
      return 'Clear Animation'
    case 'timeline.morph':
      return 'Create Morph Animation'
    case 'timeline.dimension':
      return origin.detail === undefined
        ? 'Load Dimension Animation'
        : `Load ${origin.detail} Animation`
  }
}

/** Stable follow-cam hint for an exact snapshot action. */
export function snapshotOriginFocus(value: unknown): string | undefined {
  const origin = tryValidateSnapshotOrigin(value)
  if (!origin) return undefined

  switch (origin.kind) {
    case 'flame.randomize':
      return 'ui:randomizer-generate'
    case 'flame.mutate':
      return 'ui:randomizer-mutate'
    case 'flame.random-gallery':
    case 'flame.history':
      return 'ui:randomizer-card'
    case 'flame.file':
    case 'flame.home':
      return 'ui:load-flame'
    case 'flame.gallery':
      return 'ui:gallery-picker'
    case 'flame.new':
      return 'ui:new-flame'
    case 'flame.breed':
    case 'flame.evolve':
    case 'flame.simulator':
    case 'flame.ancestry':
      return 'ui:genetics-menu'
    case 'flame.dimension':
    case 'timeline.dimension':
      return 'ui:dimension-toggle'
    case 'timeline.random':
      return 'ui:random-animation'
    case 'timeline.smart':
      return 'ui:smart-animation'
    case 'timeline.colors':
      return 'ui:animation-colors'
    case 'timeline.preset':
      return 'ui:animation-presets'
    case 'timeline.load':
      return 'ui:timeline-section'
    case 'timeline.clear':
      return 'ui:animation-clear'
    case 'timeline.morph':
      return 'ui:morph-picker'
  }
}

/**
 * Snapshot-origin argument positions are append-only so older recordings keep
 * their exact signatures: flame.load already owns args 0–2 (descriptor,
 * label, palette provenance), while timeline.loadTimeline originally owned
 * only arg 0.
 */
export function snapshotOriginForCommand(
  commandId: string,
  args: readonly unknown[],
): SnapshotOrigin | undefined {
  if (commandId === 'flame.load') return tryValidateSnapshotOrigin(args[3])
  if (commandId === 'timeline.loadTimeline') {
    return tryValidateSnapshotOrigin(args[1])
  }
  return undefined
}
