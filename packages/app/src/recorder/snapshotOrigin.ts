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

const SNAPSHOT_LABEL_MAPPERS: Record<
  SnapshotOrigin['kind'],
  (detail: string | undefined) => string
> = {
  'flame.randomize': () => 'Randomize Flame',
  'flame.mutate': () => 'Mutate Flame',
  'flame.random-gallery': () => 'Apply Random Flame',
  'flame.history': () => 'Load Randomizer History',
  'flame.gallery': (detail) => withDetail('Load Gallery Flame', detail),
  'flame.file': (detail) => withDetail('Load Flame', detail),
  'flame.home': (detail) => withDetail('Open Home Flame', detail),
  'flame.new': () => 'New Flame',
  'flame.breed': () => 'Apply Bred Flame',
  'flame.evolve': () => 'Apply Evolved Flame',
  'flame.simulator': () => 'Apply Simulator Flame',
  'flame.ancestry': () => 'Load Ancestry Flame',
  'flame.dimension': (detail) =>
    detail === undefined ? 'Switch Dimensions' : `Switch to ${detail}`,
  'timeline.random': (detail) => withDetail('Random Animate', detail),
  'timeline.smart': () => 'Smart Animate',
  'timeline.colors': () => 'Animate Colors',
  'timeline.preset': (detail) => withDetail('Apply Animation Preset', detail),
  'timeline.load': (detail) => withDetail('Load Animation', detail),
  'timeline.clear': () => 'Clear Animation',
  'timeline.morph': () => 'Create Morph Animation',
  'timeline.dimension': (detail) =>
    detail === undefined
      ? 'Load Dimension Animation'
      : `Load ${detail} Animation`,
}

/** Human caption for an exact snapshot action. */
export function snapshotOriginLabel(value: unknown): string | undefined {
  const origin = tryValidateSnapshotOrigin(value)
  if (!origin) return undefined
  const mapper = SNAPSHOT_LABEL_MAPPERS[origin.kind]
  return mapper ? mapper(origin.detail) : undefined
}

const SNAPSHOT_ORIGIN_FOCUS_MAP: Record<SnapshotOrigin['kind'], string> = {
  'flame.randomize': 'ui:randomizer-generate',
  'flame.mutate': 'ui:randomizer-mutate',
  'flame.random-gallery': 'ui:randomizer-card',
  'flame.history': 'ui:randomizer-card',
  'flame.file': 'ui:load-flame',
  'flame.home': 'ui:load-flame',
  'flame.gallery': 'ui:gallery-picker',
  'flame.new': 'ui:new-flame',
  'flame.breed': 'ui:genetics-menu',
  'flame.evolve': 'ui:genetics-menu',
  'flame.simulator': 'ui:genetics-menu',
  'flame.ancestry': 'ui:genetics-menu',
  'flame.dimension': 'ui:dimension-toggle',
  'timeline.dimension': 'ui:dimension-toggle',
  'timeline.random': 'ui:random-animation',
  'timeline.smart': 'ui:smart-animation',
  'timeline.colors': 'ui:animation-colors',
  'timeline.preset': 'ui:animation-presets',
  'timeline.load': 'ui:timeline-section',
  'timeline.clear': 'ui:animation-clear',
  'timeline.morph': 'ui:morph-picker',
}

/** Stable follow-cam hint for an exact snapshot action. */
export function snapshotOriginFocus(value: unknown): string | undefined {
  const origin = tryValidateSnapshotOrigin(value)
  if (!origin) return undefined
  return SNAPSHOT_ORIGIN_FOCUS_MAP[origin.kind]
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
