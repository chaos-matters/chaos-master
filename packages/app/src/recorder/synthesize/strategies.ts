import type { Atom, AtomGroup } from './atoms'

/**
 * How a creation is told.
 *
 * The steps are the same set either way — what changes is the order, and the
 * order is the whole story. Building one transform at a time reads like an
 * artist working; laying every transform down first and then colouring them
 * reads like a print coming up in a tray.
 */
export type SynthesisStrategy =
  | 'perTransform'
  | 'layered'
  | 'sculpt'
  | 'surprise'

export const SYNTHESIS_STRATEGIES: readonly SynthesisStrategy[] = [
  'perTransform',
  'layered',
  'sculpt',
  'surprise',
]

export function isSynthesisStrategy(
  value: unknown,
): value is SynthesisStrategy {
  return (
    typeof value === 'string' &&
    (SYNTHESIS_STRATEGIES as readonly string[]).includes(value)
  )
}

/** Small, fast, seeded and reproducible — the seed is part of the session. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GROUP_RANK: Record<AtomGroup, number> = {
  stage: 0,
  palette: 1,
  structure: 2,
  shape: 3,
  variation: 4,
  colour: 5,
  render: 6,
  camera: 7,
  final: 8,
}

export type OrderOptions = {
  strategy: SynthesisStrategy
  seed: number
  /** Colour before shape, everywhere the strategy has a choice. */
  colourFirst?: boolean
}

/**
 * Put the atoms in the order a viewer will watch them in.
 *
 * Dependencies are never a strategy's business: this picks repeatedly from the
 * atoms whose prerequisites have already run, so a strategy only supplies a
 * PREFERENCE (a rank), and no ordering it expresses can produce a step that
 * addresses a transform which does not exist yet.
 */
export function orderAtoms(
  atoms: readonly Atom[],
  options: OrderOptions,
): Atom[] {
  const rankOf = rankFunction(atoms, options)
  const remaining = atoms.map((atom, index) => ({
    atom,
    index,
    rank: rankOf(atom, index),
  }))
  const provided = new Set<string>()
  const ordered: Atom[] = []

  while (remaining.length > 0) {
    let bestPosition = -1
    for (const [position, entry] of remaining.entries()) {
      const ready = (entry.atom.needs ?? []).every((need) => provided.has(need))
      if (!ready) continue
      if (
        bestPosition === -1 ||
        entry.rank < remaining[bestPosition]!.rank ||
        (entry.rank === remaining[bestPosition]!.rank &&
          entry.index < remaining[bestPosition]!.index)
      ) {
        bestPosition = position
      }
    }
    if (bestPosition === -1) {
      // A cycle or a missing prerequisite. Nothing here can create one, but a
      // planner that silently dropped steps would be worse than one that ends
      // with a bigger snap, so the rest is simply left unbuilt.
      break
    }
    const [entry] = remaining.splice(bestPosition, 1)
    if (entry === undefined) break
    ordered.push(entry.atom)
    provided.add(entry.atom.key)
    for (const key of entry.atom.provides ?? []) provided.add(key)
  }

  return ordered
}

function rankFunction(
  atoms: readonly Atom[],
  options: OrderOptions,
): (atom: Atom, index: number) => number {
  const transformCount =
    atoms.reduce(
      (max, atom) => Math.max(max, (atom.transformIndex ?? -1) + 1),
      0,
    ) || 1
  // Variations are told loudest first, so the shape a viewer notices arrives
  // before the trims. Ranks are dense so a whole transform's block still fits
  // between two transform slots.
  const byProminence = (atom: Atom) =>
    atom.prominence === undefined
      ? 0
      : Math.max(0, 1 - Math.min(1, Math.abs(atom.prominence)))

  const colourRank = (group: AtomGroup) =>
    options.colourFirst === true && (group === 'colour' || group === 'palette')
      ? GROUP_RANK.structure + 0.5
      : GROUP_RANK[group]

  // One scale per nesting level, so a rank never collides across levels: a
  // transform block is 1000 wide, a group inside it 10, and prominence orders
  // within a group.
  const TRANSFORM_SCALE = 1000
  const GROUP_SCALE = 10
  const transformBlock = (atom: Atom) =>
    (atom.transformIndex ?? transformCount) * TRANSFORM_SCALE +
    colourRank(atom.group) * GROUP_SCALE +
    byProminence(atom)

  switch (options.strategy) {
    case 'layered':
      // Every transform as a bare skeleton first, then shapes, then variations
      // by weight, then colour — the print coming up in the tray.
      return (atom) =>
        colourRank(atom.group) * 1_000_000 +
        byProminence(atom) * 1000 +
        (atom.transformIndex ?? 0)

    case 'sculpt':
      // Set the stage first (camera and render settings), then carve the
      // transforms one by one.
      return (atom) => {
        if (atom.group === 'stage') return 0
        if (atom.group === 'camera') return 1
        if (atom.group === 'render') return 2
        if (atom.group === 'palette') return 3
        if (atom.group === 'final') return 10_000_000
        return 1000 + transformBlock(atom)
      }

    case 'surprise': {
      // A different journey per seed, still legal: the ready-set does the
      // ordering work, so "random" can never mean "addresses nothing".
      const random = createRandom(options.seed)
      const jitter = atoms.map(() => random())
      return (atom, index) => {
        if (atom.group === 'stage') return -1
        return jitter[index] ?? 0
      }
    }

    case 'perTransform':
    default:
      // One transform finished before the next is started.
      return (atom) => {
        if (atom.group === 'stage') return 0
        if (atom.group === 'palette') return 1
        if (atom.group === 'final') return 10_000_000
        if (atom.group === 'render' || atom.group === 'camera') {
          return 20_000_000 + GROUP_RANK[atom.group]
        }
        return 1000 + transformBlock(atom)
      }
  }
}
