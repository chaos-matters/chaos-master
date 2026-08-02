import { createRoot, createSignal } from 'solid-js'
import { deepClone } from '@/utils/clone'
import * as db from './ancestryDb'
import type { FlameDescriptor } from './schema/flameSchema'

// ── Content hash ────────────────────────────────────────────────────────────

/**
 * Deterministic 64-bit content hash for FlameDescriptor.
 * Uses a dual-32-bit hash (multiply-shift) over `JSON.stringify` output.
 * Not cryptographic — collision resistance is statistical, which is sufficient
 * for a single-user local ancestry tree.
 *
 * Hashes the flame's GENETICS — its transforms, plus the dimension they live in
 * — and deliberately nothing else.
 *
 * It used to stringify the whole descriptor, which made the ancestry tree
 * unusable in practice: the hash is the node's identity, so panning the camera,
 * zooming, adjusting exposure, renaming, or leaving a hover blend applied all
 * produced a DIFFERENT identity for the same flame. The lookup then missed,
 * `ensureNode` filed it as a fresh root, and the modal showed a lone "Current"
 * card — a bred child sitting next to a "Blended: 40%" badge with its parents
 * apparently gone.
 *
 * A flame you panned is the same flame. Two flames are relatives because of
 * their transforms, which is exactly what breeding crosses; the camera and the
 * colour grade are how you are looking at one, not which one it is. Dimension
 * stays in because 2D and 3D transforms are not interchangeable.
 *
 * Changing this orphans ancestry recorded by older builds — their hashes were
 * computed over the whole descriptor. That is a one-time reset of a local
 * cache which did not work anyway.
 */
export function contentHash(flame: FlameDescriptor): string {
  const str = JSON.stringify({
    transforms: flame.transforms,
    dimensions: flame.renderSettings.dimensions ?? 2,
  })
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0')
  )
}

// ── Ancestry node ───────────────────────────────────────────────────────────

export interface AncestryNode {
  hash: string
  name: string
  parentA: string | null
  parentB: string | null
  generation: number
  createdAt: number
  flame: FlameDescriptor
  /** The crossover mode used to create this node (if bred). */
  crossoverMode?: string
  /** The mutation strength used when this node was bred. */
  mutationStrength?: number
}

// ── In-memory store (reactive, synchronous reads) ────────────────────────────

type NodeMap = Record<string, AncestryNode>

const { nodesSignal, setNodesSignal, loaded, setLoaded } = createRoot(() => {
  const [nodesSignal, setNodesSignal] = createSignal<NodeMap>({})
  /** True once the initial IndexedDB load has completed. */
  const [loaded, setLoaded] = createSignal(false)
  return { nodesSignal, setNodesSignal, loaded, setLoaded }
})

// ── Debounced IndexedDB writes ───────────────────────────────────────────────

/** Nodes that have been mutated since the last flush. */
const dirtyNodes = new Map<string, AncestryNode>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_DELAY_MS = 500

function scheduleFlush() {
  if (flushTimer !== null) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    const batch = [...dirtyNodes.values()]
    dirtyNodes.clear()
    db.putNodes(batch).catch((err: unknown) => {
      console.warn('[ancestry] IndexedDB write failed:', err)
    })
  }, FLUSH_DELAY_MS)
}

/** Flush immediately (e.g. on page unload). */
function flushNow(): Promise<void> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  const batch = [...dirtyNodes.values()]
  dirtyNodes.clear()
  if (batch.length === 0) return Promise.resolve()
  return db.putNodes(batch)
}

// ── Initialization ───────────────────────────────────────────────────────────

/**
 * Load persisted ancestry data from IndexedDB.
 * Called once on app startup. Until this resolves, ancestry reads return {}.
 */
export async function initAncestry(): Promise<void> {
  try {
    const rows = await db.loadAllNodes()
    const map: NodeMap = {}
    for (const [hash, node] of rows) {
      map[hash] = node
    }
    setNodesSignal(map)
  } catch (err) {
    console.warn('[ancestry] Failed to load from IndexedDB:', err)
  } finally {
    setLoaded(true)
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Record a breeding event: two parents produced a set of children.
 * Updates the in-memory store immediately and schedules a debounced
 * IndexedDB write. Safe to call at high frequency (e.g. 100+ breeds/sec
 * in the Population Simulator).
 */
export function recordBreed(
  parentA: FlameDescriptor,
  parentB: FlameDescriptor,
  children: FlameDescriptor[],
  breedConfig?: { crossoverMode?: string; mutationStrength?: number },
): void {
  const hashA = contentHash(parentA)
  const hashB = contentHash(parentB)

  const nodes = { ...nodesSignal() }
  const now = Date.now()
  let changed = false

  // Lazy-create parent entries if missing (random / imported flames).
  // Snapshot via deepClone: callers may pass the live workspace store, and a
  // stored reference would keep mutating with every edit (and IndexedDB would
  // persist whatever it happens to look like at flush time).
  for (const [hash, flame] of [
    [hashA, parentA],
    [hashB, parentB],
  ] as const) {
    if (!nodes[hash]) {
      nodes[hash] = {
        hash,
        name: flame.metadata?.name || 'Unnamed',
        parentA: null,
        parentB: null,
        generation: 0,
        createdAt: now,
        flame: deepClone(flame),
      }
      dirtyNodes.set(hash, nodes[hash])
      changed = true
    }
  }

  const genA = nodes[hashA]!.generation
  const genB = nodes[hashB]!.generation
  const childGen = Math.max(genA, genB) + 1

  for (const child of children) {
    const childHash = contentHash(child)
    if (!nodes[childHash]) {
      nodes[childHash] = {
        hash: childHash,
        name: child.metadata?.name || 'Unnamed',
        parentA: hashA,
        parentB: hashB,
        generation: childGen,
        createdAt: now,
        flame: child,
        crossoverMode: breedConfig?.crossoverMode,
        mutationStrength: breedConfig?.mutationStrength,
      }
      dirtyNodes.set(childHash, nodes[childHash])
      changed = true
    }
  }

  if (changed) {
    setNodesSignal(nodes)
    scheduleFlush()
  }
}

/**
 * Ensure a flame descriptor has an ancestry node (root if no parents exist).
 * Does nothing if the flame's content hash is already in the store.
 * Useful so the Ancestry Tree modal always has at least a root node to display,
 * even for gallery-loaded or imported flames that have never been bred.
 */
export function ensureNode(flame: FlameDescriptor): void {
  const hash = contentHash(flame)
  if (nodesSignal()[hash]) return
  // deepClone for the same live-store snapshot reason as recordBreed.
  const node: AncestryNode = {
    hash,
    name: flame.metadata?.name || 'Unnamed',
    parentA: null,
    parentB: null,
    generation: 0,
    createdAt: Date.now(),
    flame: deepClone(flame),
  }
  setNodesSignal({ ...nodesSignal(), [hash]: node })
  dirtyNodes.set(hash, node)
  scheduleFlush()
}

/** All nodes in the ancestry store. */
export function getAncestryNodes(): Record<string, AncestryNode> {
  return nodesSignal()
}

/** Get a single node by content hash. */
export function getNode(hash: string): AncestryNode | undefined {
  return nodesSignal()[hash]
}

/** Whether the initial IndexedDB load has completed. */
export function isAncestryLoaded(): boolean {
  return loaded()
}

/** Direct children of a node (nodes whose parentA or parentB matches the hash). */
export function getChildrenOf(hash: string): AncestryNode[] {
  return Object.values(nodesSignal()).filter(
    (n) => n.parentA === hash || n.parentB === hash,
  )
}

/** Roots: nodes with no recorded parents. */
export function getRoots(): AncestryNode[] {
  return Object.values(nodesSignal()).filter(
    (n) => n.parentA === null && n.parentB === null,
  )
}

/**
 * Walk up the ancestry chain from a node, returning [node, ...parents]
 * ordered from the starting node up to the root(s).
 */
export function getAncestorsOf(hash: string): AncestryNode[] {
  const result: AncestryNode[] = []
  const visited = new Set<string>()
  const queue = [hash]
  while (queue.length > 0) {
    const h = queue.shift()!
    if (visited.has(h)) continue
    visited.add(h)
    const node = getNode(h)
    if (!node) continue
    result.push(node)
    if (node.parentA) queue.push(node.parentA)
    if (node.parentB) queue.push(node.parentB)
  }
  return result
}

/**
 * Build a lineage tree around a focal node: ancestors to the left,
 * the focal node in the centre, descendants to the right.
 *
 * Returns layers: generation index → nodes in that generation.
 * Layer 0 is the earliest ancestor(s), layer N is the focal node,
 * layers beyond are descendants.
 */
export interface LineageLayer {
  generation: number
  nodes: AncestryNode[]
  isFocal: boolean
}

export function getLineageTree(focalHash: string): LineageLayer[] {
  const nodeMap = new Map<number, AncestryNode[]>()

  // Collect ancestors
  const ancestors = getAncestorsOf(focalHash)
  for (const node of ancestors) {
    const existing = nodeMap.get(node.generation) ?? []
    existing.push(node)
    nodeMap.set(node.generation, existing)
  }

  // Collect descendants (BFS from focal node)
  const focal = getNode(focalHash)
  if (!focal) return []

  const focalGen = focal.generation
  const visited = new Set<string>()
  const queue = [focalHash]
  while (queue.length > 0) {
    const h = queue.shift()!
    if (visited.has(h)) continue
    visited.add(h)
    const node = getNode(h)
    if (!node) continue
    const existing = nodeMap.get(node.generation) ?? []
    if (!existing.some((n) => n.hash === node.hash)) {
      existing.push(node)
    }
    nodeMap.set(node.generation, existing)
    for (const child of getChildrenOf(h)) {
      if (!visited.has(child.hash)) queue.push(child.hash)
    }
  }

  // Build sorted layers
  const generations = [...new Set([...nodeMap.keys()])].sort((a, b) => a - b)
  return generations.map((gen) => ({
    generation: gen,
    nodes: nodeMap.get(gen) ?? [],
    isFocal: gen === focalGen,
  }))
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

/** Flush pending writes before page unload. */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    void flushNow()
  })
  // Also flush on visibility change (tab hidden) as a safety net.
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushNow()
    }
  })
}
