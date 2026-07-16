import { recordEntries } from '@/utils/record'
import type { FlameDescriptor } from './schema/flameSchema'

// ── Types ────────────────────────────────────────────────────────────────────

export interface RenderSettingDiff {
  setting: string
  label: string
  valueA: number
  valueB: number
  similarity: number // 0–1
}

export interface MatchedTransform {
  idA: string
  idB: string
  /** 0–1 overall transform similarity */
  similarity: number
  affineSimilarity: number
  colorSimilarity: number
  variationSimilarity: number
}

export interface FlameDiffResult {
  /** 0–100 overall similarity percentage */
  overallSimilarity: number
  /** Weight breakdown of the overall score */
  weights: {
    transforms: number
    render: number
  }
  /** Per-setting render comparison */
  renderDiffs: RenderSettingDiff[]
  /** Overall render similarity 0–1 */
  renderSimilarity: number
  /** Matched transform pairs */
  matchedTransforms: MatchedTransform[]
  /** Transform IDs only in flame A */
  unmatchedA: string[]
  /** Transform IDs only in flame B */
  unmatchedB: string[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** Normalised difference: 0 = identical, 1 = maximally different */
function normDiff(a: number, b: number, range: number): number {
  if (range === 0) return 0
  return clamp01(Math.abs(a - b) / range)
}

/** Similarity from normalised difference: 1 = identical, 0 = maximally different */
function sim1D(a: number, b: number, range: number): number {
  return 1 - normDiff(a, b, range)
}

/** Jaccard similarity of two sets */
function jaccard<T>(setA: Set<T>, setB: Set<T>): number {
  if (setA.size === 0 && setB.size === 0) return 1
  const intersection = new Set([...setA].filter((x) => setB.has(x)))
  const union = new Set([...setA, ...setB])
  return intersection.size / union.size
}

// ── Render settings comparison ───────────────────────────────────────────────

interface SettingDef {
  key: string
  label: string
  range: number
  /** Optional extractor if the value needs special handling */
  extract?: (rs: Record<string, unknown>) => number
}

const RENDER_SETTINGS: SettingDef[] = [
  { key: 'exposure', label: 'Exposure', range: 16 },
  { key: 'skipIters', label: 'Skip Iters', range: 30 },
  { key: 'vibrancy', label: 'Vibrancy', range: 3 },
  { key: 'contrast', label: 'Contrast', range: 19.99 },
  { key: 'gamma', label: 'Gamma', range: 7.9 },
  { key: 'highlightPower', label: 'Highlight Power', range: 2 },
  { key: 'lightPower', label: 'Light Power', range: 5 },
  { key: 'depthColorPower', label: 'Depth Color', range: 5 },
  { key: 'densityEstimationQuality', label: 'DE Quality', range: 20 },
]

function compareRenderSettings(
  a: FlameDescriptor,
  b: FlameDescriptor,
): { diffs: RenderSettingDiff[]; similarity: number } {
  const rsA = a.renderSettings ?? ({} as Record<string, unknown>)
  const rsB = b.renderSettings ?? ({} as Record<string, unknown>)

  const diffs: RenderSettingDiff[] = []
  let totalSim = 0

  for (const def of RENDER_SETTINGS) {
    const va = (rsA as unknown as Record<string, number>)[def.key]
    const vb = (rsB as unknown as Record<string, number>)[def.key]
    if (va === undefined && vb === undefined) continue
    const av = va ?? 0
    const bv = vb ?? 0
    const sim = sim1D(av, bv, def.range)
    diffs.push({
      setting: def.key,
      label: def.label,
      valueA: av,
      valueB: bv,
      similarity: sim,
    })
    totalSim += sim
  }

  const similarity = diffs.length > 0 ? totalSim / diffs.length : 1
  return { diffs, similarity }
}

// ── Transform comparison ─────────────────────────────────────────────────────

interface LooseTransform {
  probability: number
  colorSpeed?: number
  color: { x: number; y: number }
  preAffine: Record<string, number>
  postAffine: Record<string, number>
  variations: Record<string, { type: string; weight: number }>
}

function variationTypeSet(t: LooseTransform): Set<string> {
  return new Set(Object.values(t.variations).map((v) => v.type))
}

/** Compare affine coefficients between two transforms. */
function compareAffines(
  a: Record<string, number>,
  b: Record<string, number>,
): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  if (keys.size === 0) return 1

  let totalSim = 0
  for (const key of keys) {
    const av = a[key] ?? 0
    const bv = b[key] ?? 0
    // Affine coefs typically in [-2, 2], use range 4
    totalSim += sim1D(av, bv, 4)
  }
  return totalSim / keys.size
}

/** Compare colors (blend index x,y and color speed). */
function compareColors(a: LooseTransform, b: LooseTransform): number {
  const simX = sim1D(a.color.x, b.color.x, 1)
  const simY = sim1D(a.color.y, b.color.y, 1)
  const simSpeed = sim1D(a.colorSpeed ?? 0.4, b.colorSpeed ?? 0.4, 1)
  return (simX + simY + simSpeed) / 3
}

/** Full transform diff. */
function diffTransforms(
  flameA: FlameDescriptor,
  flameB: FlameDescriptor,
): {
  matched: MatchedTransform[]
  unmatchedA: string[]
  unmatchedB: string[]
} {
  const entriesA = recordEntries(flameA.transforms) as [
    string,
    LooseTransform,
  ][]
  const entriesB = recordEntries(flameB.transforms) as [
    string,
    LooseTransform,
  ][]

  if (entriesA.length === 0 && entriesB.length === 0) {
    return { matched: [], unmatchedA: [], unmatchedB: [] }
  }

  // Build a similarity matrix: for each pair (A_i, B_j), compute similarity
  const matrix: {
    i: number
    j: number
    sim: number
    variationSim: number
    affineSim: number
    colorSim: number
  }[] = []

  for (let i = 0; i < entriesA.length; i++) {
    const [, ta] = entriesA[i]!
    const typesA = variationTypeSet(ta)
    for (let j = 0; j < entriesB.length; j++) {
      const [, tb] = entriesB[j]!
      const typesB = variationTypeSet(tb)
      const variationSim = jaccard(typesA, typesB)
      const affineSim =
        (compareAffines(ta.preAffine, tb.preAffine) +
          compareAffines(ta.postAffine, tb.postAffine)) /
        2
      const colorSim = compareColors(ta, tb)
      // Weighted: variation types matter most for identity
      const sim = variationSim * 0.5 + affineSim * 0.3 + colorSim * 0.2
      matrix.push({ i, j, sim, variationSim, affineSim, colorSim })
    }
  }

  // Greedy matching: sort by similarity descending, match best pairs
  matrix.sort((a, b) => b.sim - a.sim)

  const usedA = new Set<number>()
  const usedB = new Set<number>()
  const matched: MatchedTransform[] = []

  for (const m of matrix) {
    if (usedA.has(m.i) || usedB.has(m.j)) continue
    usedA.add(m.i)
    usedB.add(m.j)
    matched.push({
      idA: entriesA[m.i]![0],
      idB: entriesB[m.j]![0],
      similarity: m.sim,
      affineSimilarity: m.affineSim,
      colorSimilarity: m.colorSim,
      variationSimilarity: m.variationSim,
    })
    if (matched.length >= Math.min(entriesA.length, entriesB.length)) break
  }

  const unmatchedA = entriesA.filter((_, i) => !usedA.has(i)).map(([id]) => id)
  const unmatchedB = entriesB.filter((_, j) => !usedB.has(j)).map(([id]) => id)

  return { matched, unmatchedA, unmatchedB }
}

// ── Public API ───────────────────────────────────────────────────────────────

const WEIGHT_TRANSFORMS = 0.55
const WEIGHT_RENDER = 0.45

/**
 * Compute a structural diff between two flame descriptors.
 * Returns overall similarity (0–100) plus detailed breakdowns.
 */
export function diffFlames(
  a: FlameDescriptor,
  b: FlameDescriptor,
): FlameDiffResult {
  const render = compareRenderSettings(a, b)
  const tDiff = diffTransforms(a, b)

  // Overall transform similarity: average matched similarity, penalised by
  // unmatched transforms
  const totalTransforms = Math.max(
    Object.keys(a.transforms).length,
    Object.keys(b.transforms).length,
  )
  let transformSim = 0
  if (totalTransforms === 0) {
    // Both flames have zero transforms — they are identically empty
    transformSim = 1
  } else if (tDiff.matched.length > 0) {
    const avgMatchSim =
      tDiff.matched.reduce((s, m) => s + m.similarity, 0) / tDiff.matched.length
    // Penalise unmatched: each unmatched transform counts as zero similarity
    const unmatched = tDiff.unmatchedA.length + tDiff.unmatchedB.length
    transformSim =
      (avgMatchSim * tDiff.matched.length + 0 * unmatched) / totalTransforms
  }

  const overall =
    (transformSim * WEIGHT_TRANSFORMS + render.similarity * WEIGHT_RENDER) * 100

  return {
    overallSimilarity: Math.round(overall),
    weights: {
      transforms: WEIGHT_TRANSFORMS,
      render: WEIGHT_RENDER,
    },
    renderDiffs: render.diffs,
    renderSimilarity: render.similarity,
    matchedTransforms: tDiff.matched,
    unmatchedA: tDiff.unmatchedA,
    unmatchedB: tDiff.unmatchedB,
  }
}
