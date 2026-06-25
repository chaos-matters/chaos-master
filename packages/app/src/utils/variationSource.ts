import { tgpu } from 'typegpu'
import { allTransformVariations } from '@/flame/variations'

// Variation types are accepted as plain `string` here: every lookup below is a
// string-keyed record, and typing these against the ~600-member variation
// union pushes tsc's instantiation budget over TS2590 at call sites.

/**
 * On-demand source + WGSL for a variation, for the documentation modal.
 *
 * TS source is pulled lazily via Vite's `?raw` glob so it never weighs on the
 * main bundle; WGSL is generated from the variation's `TgpuFn` and memoized.
 */

// Lazy raw-source loaders keyed by file path.
const rawSourceModules = import.meta.glob('../flame/variations/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

// basename (no extension) -> loader. Variation files are named after their
// type key (e.g. `augerVar.tsx` exports `augerVar`), so the basename is the
// lookup key. Shared module names that never map to a type are skipped.
const SKIP_BASENAMES = new Set(['index', 'types', 'utils', 'categories'])
const sourceByBasename: Record<string, () => Promise<string>> = {}
for (const [path, loader] of Object.entries(rawSourceModules)) {
  const file = path.slice(path.lastIndexOf('/') + 1)
  if (/\.(test|stories)\.(ts|tsx)$/.test(file)) continue
  const basename = file.replace(/\.(ts|tsx)$/, '')
  if (SKIP_BASENAMES.has(basename)) continue
  sourceByBasename[basename] = loader
}

/** Variation types whose source-file basename differs from the type key. */
const SOURCE_BASENAME_OVERRIDES: Partial<Record<string, string>> = {}

/** The variation's TypeScript implementation source, or undefined if unmapped. */
export async function variationTsSource(
  type: string,
): Promise<string | undefined> {
  // The type literal always carries a trailing "Var" (e.g. `blobVar`) so the UI
  // can strip it for a clean name, but a number of source files drop it
  // (`blob.tsx`, `curl.tsx`, …). Resolve by trying the literal, then the
  // Var-stripped basename, then any explicit override — so the lookup works
  // regardless of whether a file matches its type key.
  const candidates = [
    SOURCE_BASENAME_OVERRIDES[type],
    type,
    type.replace(/Var$/, ''),
  ].filter((b): b is string => Boolean(b))
  const loader = candidates.map((b) => sourceByBasename[b]).find(Boolean)
  if (!loader) return undefined
  try {
    return await loader()
  } catch {
    return undefined
  }
}

// tgpu.resolve is overloaded; cast to the permissive array form used elsewhere
// (see ifsPipeline.resolve.test.ts) so a single TgpuFn can be resolved.
const resolveToWgsl = tgpu.resolve as unknown as (
  items: readonly unknown[],
  options?: { names?: 'strict' | 'random' },
) => string

const wgslCache = new Map<string, string | undefined>()

// Index by plain string to avoid the ~300-member keyof union (TS2590).
const VARIATIONS = allTransformVariations as unknown as Record<
  string,
  { fn?: unknown }
>

/** The WGSL the variation resolves to on the GPU, memoized. Pure client-side. */
export function resolveVariationWgsl(type: string): string | undefined {
  if (wgslCache.has(type)) return wgslCache.get(type)
  let wgsl: string | undefined
  try {
    const fn = VARIATIONS[type]?.fn
    wgsl = fn ? resolveToWgsl([fn], { names: 'strict' }) : undefined
  } catch {
    wgsl = undefined
  }
  wgslCache.set(type, wgsl)
  return wgsl
}
