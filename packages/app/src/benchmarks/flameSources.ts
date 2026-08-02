import { examples } from '@/flame/examples'
import { generateSeededRandomFlame } from '@/flame/randomize'
import { deepClone } from '@/utils/clone'
import { loadRecentFlames } from '@/utils/recentFlames'
import type { BenchmarkFlameV1, JsonValue } from './model'
import type { AncestryNode } from '@/flame/ancestry'
import type { GenerateRandomFlameConfig } from '@/flame/randomize'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TransformVariationType } from '@/flame/variations'
import type { RecentFlame } from '@/utils/recentFlames'

export interface BenchmarkFlameProvenance {
  readonly sourceKey?: string
  readonly savedAt?: number
  readonly generation?: number
  readonly parentA?: string | null
  readonly parentB?: string | null
  readonly seed?: number
}

export interface BenchmarkFlameSourceDescriptor {
  readonly id: string
  readonly label: string
  readonly source: BenchmarkFlameV1['source']
  readonly digest: string
  readonly flame: FlameDescriptor
  readonly dimensions: number
  readonly transformCount: number
  readonly provenance: BenchmarkFlameProvenance
}

export interface CreateBenchmarkFlameSourceOptions {
  readonly id?: string
  readonly label?: string
  readonly source: BenchmarkFlameV1['source']
  readonly provenance?: BenchmarkFlameProvenance
}

const DEFAULT_SURPRISE_VARIATIONS: readonly TransformVariationType[] = [
  'linearVar',
  'swirlVar',
  'sphericalVar',
  'horseshoeVar',
  'polarVar',
  'discVar',
  'bubbleVar',
  'curlVar',
  'waves2Var',
  'juliaNVar',
]

export const DEFAULT_BENCHMARK_SURPRISE_CONFIG: Readonly<GenerateRandomFlameConfig> =
  {
    strength: 0.55,
    minTransforms: 3,
    maxTransforms: 5,
    minVariations: 1,
    maxVariations: 2,
    allowedVariations: [...DEFAULT_SURPRISE_VARIATIONS],
    dimensions: 2,
  }

function canonicalJson(
  value: unknown,
  ancestors: ReadonlySet<object> = new Set(),
): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null'
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new TypeError('Cannot hash a cyclic flame descriptor')
    }
    const nextAncestors = new Set(ancestors).add(value)
    return `[${value
      .map((item) =>
        item === undefined ? 'null' : canonicalJson(item, nextAncestors),
      )
      .join(',')}]`
  }
  if (typeof value === 'object') {
    if (ancestors.has(value)) {
      throw new TypeError('Cannot hash a cyclic flame descriptor')
    }
    const nextAncestors = new Set(ancestors).add(value)
    const object = value as Record<string, unknown>
    const entries = Object.keys(object)
      .sort()
      .flatMap((key) => {
        const item = object[key]
        return item === undefined ||
          typeof item === 'function' ||
          typeof item === 'symbol'
          ? []
          : [`${JSON.stringify(key)}:${canonicalJson(item, nextAncestors)}`]
      })
    return `{${entries.join(',')}}`
  }
  throw new TypeError(`Cannot hash a ${typeof value} value`)
}

/**
 * Stable non-cryptographic digest for local flame identity. Object keys are
 * canonicalized first, so equivalent descriptors hash identically even when
 * their insertion order differs.
 */
export function benchmarkFlameDigest(flame: FlameDescriptor): string {
  const serialized = canonicalJson(flame)
  let first = 0xdead_beef
  let second = 0x41c6_ce57
  for (let index = 0; index < serialized.length; index += 1) {
    const character = serialized.charCodeAt(index)
    first = Math.imul(first ^ character, 2_654_435_761)
    second = Math.imul(second ^ character, 1_597_334_677)
  }
  const hex =
    (first >>> 0).toString(16).padStart(8, '0') +
    (second >>> 0).toString(16).padStart(8, '0')
  return `cm-flame-v1:${hex}`
}

function fallbackLabel(id: string): string {
  return id
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/(\D)(\d+)/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim()
}

export function createBenchmarkFlameSource(
  flame: FlameDescriptor,
  options: CreateBenchmarkFlameSourceOptions,
): BenchmarkFlameSourceDescriptor {
  const snapshot = deepClone(flame)
  const digest = benchmarkFlameDigest(snapshot)
  const label =
    options.label?.trim() ||
    snapshot.metadata?.name?.trim() ||
    fallbackLabel(options.id ?? 'Flame')
  return {
    id: options.id ?? `${options.source}:${digest}`,
    label,
    source: options.source,
    digest,
    flame: snapshot,
    dimensions: snapshot.renderSettings.dimensions ?? 2,
    transformCount: Object.keys(snapshot.transforms).length,
    provenance: options.provenance ?? {},
  }
}

export function toBenchmarkFlameV1(
  source: BenchmarkFlameSourceDescriptor,
  options: { readonly includeSnapshot?: boolean } = {},
): BenchmarkFlameV1 {
  const includeSnapshot = options.includeSnapshot ?? true
  return {
    id: source.id,
    label: source.label,
    source: source.source,
    digest: source.digest,
    ...(includeSnapshot
      ? {
          snapshot: deepClone(source.flame) as unknown as JsonValue,
        }
      : {}),
  }
}

export function listBuiltinBenchmarkFlames(
  catalog: Readonly<Record<string, FlameDescriptor>> = examples,
): readonly BenchmarkFlameSourceDescriptor[] {
  return Object.entries(catalog).map(([key, flame]) =>
    createBenchmarkFlameSource(flame, {
      id: `builtin:${key}`,
      label: flame.metadata?.name || fallbackLabel(key),
      source: 'builtin',
      provenance: { sourceKey: key },
    }),
  )
}

export function listRecentBenchmarkFlames(
  recentFlames: readonly RecentFlame[] = loadRecentFlames(),
): readonly BenchmarkFlameSourceDescriptor[] {
  return [...recentFlames]
    .sort((left, right) => right.savedAt - left.savedAt)
    .map((recent) =>
      createBenchmarkFlameSource(recent.flame, {
        id: `recent:${recent.id}`,
        label: recent.name,
        source: 'recent',
        provenance: {
          sourceKey: recent.id,
          savedAt: recent.savedAt,
        },
      }),
    )
}

export function listAncestryBenchmarkFlames(
  ancestry: Readonly<Record<string, AncestryNode>> | readonly AncestryNode[],
): readonly BenchmarkFlameSourceDescriptor[] {
  const nodes = Array.isArray(ancestry)
    ? [...ancestry]
    : Object.values(ancestry)
  return nodes
    .sort((left, right) => right.createdAt - left.createdAt)
    .map((node) =>
      createBenchmarkFlameSource(node.flame, {
        id: `ancestry:${node.hash}`,
        label: node.name,
        source: 'gallery',
        provenance: {
          sourceKey: node.hash,
          savedAt: node.createdAt,
          generation: node.generation,
          parentA: node.parentA,
          parentB: node.parentB,
        },
      }),
    )
}

export function createSeededSurpriseFlame(
  seed: number,
  config?: GenerateRandomFlameConfig,
): BenchmarkFlameSourceDescriptor {
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError('seed must be a safe integer')
  }
  const normalizedSeed = seed >>> 0
  const effectiveConfig: GenerateRandomFlameConfig = config ?? {
    ...DEFAULT_BENCHMARK_SURPRISE_CONFIG,
    allowedVariations: [...DEFAULT_BENCHMARK_SURPRISE_CONFIG.allowedVariations],
  }
  const flame = generateSeededRandomFlame(effectiveConfig, normalizedSeed)
  return createBenchmarkFlameSource(flame, {
    id: `generated:surprise:${normalizedSeed}`,
    label: `Surprise ${normalizedSeed}`,
    source: 'generated',
    provenance: {
      sourceKey: `surprise:${normalizedSeed}`,
      seed: normalizedSeed,
    },
  })
}
