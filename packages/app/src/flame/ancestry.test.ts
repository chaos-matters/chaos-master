import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deepClone } from '@/utils/clone'
import { contentHash, ensureNode, getAncestryNodes, getChildrenOf, getLineageTree, getNode, getRoots, initAncestry, recordBreed, } from './ancestry'
import { validateFlame } from './schema/flameSchema'
import type { FlameDescriptor } from './schema/flameSchema'

// happy-dom has no IndexedDB; stub the persistence layer. loadAllNodes
// returning an empty map also lets initAncestry() act as a store reset.
vi.mock('./ancestryDb', () => ({
  loadAllNodes: vi.fn(() => Promise.resolve(new Map())),
  putNode: vi.fn(() => Promise.resolve()),
  putNodes: vi.fn(() => Promise.resolve()),
  deleteNode: vi.fn(() => Promise.resolve()),
  clearAllNodes: vi.fn(() => Promise.resolve()),
}))

let seq = 0

/** Unique valid flame per call — a distinct affine gives a distinct hash. */
function makeFlame(name: string): FlameDescriptor {
  seq++
  return validateFlame({
    version: '1.0',
    metadata: { name, author: 'test' },
    transforms: {
      [`t_${seq}`]: {
        probability: 1,
        preAffine: { a: 1, b: 0, c: seq / 1024, d: 0, e: 1, f: 0 },
        postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        color: { x: 0.5, y: 0.5 },
        variations: { [`v_${seq}`]: { type: 'linearVar', weight: 1 } },
      },
    },
  })
}

function firstTransform(flame: FlameDescriptor): { probability: number } {
  const transforms = (
    flame as unknown as { transforms: Record<string, { probability: number }> }
  ).transforms
  return Object.values(transforms)[0]!
}

/**
 * gpA + gpB → parent; parent + mate → grandchild.
 * Generations: gpA/gpB/mate 0, parent 1, grandchild 2.
 */
function buildLineage() {
  const gpA = makeFlame('Grandparent A')
  const gpB = makeFlame('Grandparent B')
  const parent = makeFlame('Parent')
  const mate = makeFlame('Mate')
  const grandchild = makeFlame('Grandchild')
  recordBreed(gpA, gpB, [parent])
  recordBreed(parent, mate, [grandchild])
  return { gpA, gpB, parent, mate, grandchild }
}

beforeEach(async () => {
  // The ancestry store is a module-level singleton; reloading from the
  // (empty) mocked DB clears nodes recorded by previous tests.
  await initAncestry()
})

describe('contentHash', () => {
  it('produces a 16-char hex hash, stable across clones', () => {
    const flame = makeFlame('Hash Me')
    const hash = contentHash(flame)
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
    expect(contentHash(flame)).toBe(hash)
    expect(contentHash(deepClone(flame))).toBe(hash)
  })

  it('changes when the content changes', () => {
    const flame = makeFlame('Original')
    const mutated = deepClone(flame)
    firstTransform(mutated).probability = 0.5
    expect(contentHash(mutated)).not.toBe(contentHash(flame))
    // Same name but different transforms is still a different flame
    expect(contentHash(makeFlame('Original'))).not.toBe(contentHash(flame))
  })

  /*
   * The hash IS the node's identity, so anything it covers can orphan a
   * lineage. It used to stringify the whole descriptor: a bred child whose
   * camera you nudged — or which still carried a 40% hover blend — hashed
   * differently from the child that was recorded, so the tree lost its parents
   * and showed a lone "Current" card.
   */
  it('survives everything that is not the flame itself', () => {
    const flame = makeFlame('Steady')
    const hash = contentHash(flame)

    const renamed = deepClone(flame)
    renamed.metadata = { ...renamed.metadata, name: 'Renamed' }
    expect(contentHash(renamed)).toBe(hash)

    const panned = deepClone(flame)
    panned.renderSettings.camera = {
      ...panned.renderSettings.camera,
      position: [0.37, -0.2],
      zoom: 2.5,
    }
    expect(contentHash(panned)).toBe(hash)

    const blended = deepClone(flame)
    blended.renderSettings.blendFlame = deepClone(flame)
    blended.renderSettings.blendWeight = 0.4
    expect(contentHash(blended)).toBe(hash)

    const graded = deepClone(flame)
    graded.renderSettings.exposure = (flame.renderSettings.exposure ?? 0) + 1
    expect(contentHash(graded)).toBe(hash)
  })

  it('still separates 2D from 3D with identical transforms', () => {
    const flat = makeFlame('Same Genes')
    const deep = deepClone(flat)
    deep.renderSettings.dimensions = 3
    expect(contentHash(deep)).not.toBe(contentHash(flat))
  })
})

describe('recordBreed', () => {
  it('lazily creates parent nodes at generation 0', () => {
    const parentA = makeFlame('Parent A')
    const parentB = makeFlame('Parent B')
    expect(getNode(contentHash(parentA))).toBeUndefined()

    recordBreed(parentA, parentB, [makeFlame('Child')])

    for (const [flame, name] of [
      [parentA, 'Parent A'],
      [parentB, 'Parent B'],
    ] as const) {
      const node = getNode(contentHash(flame))
      expect(node).toBeDefined()
      expect(node!.name).toBe(name)
      expect(node!.generation).toBe(0)
      expect(node!.parentA).toBeNull()
      expect(node!.parentB).toBeNull()
      expect(node!.crossoverMode).toBeUndefined()
    }
    expect(
      getRoots()
        .map((n) => n.hash)
        .sort(),
    ).toEqual([contentHash(parentA), contentHash(parentB)].sort())
  })

  it('records children with parent links and breed config', () => {
    const parentA = makeFlame('A')
    const parentB = makeFlame('B')
    const child = makeFlame('Child')
    recordBreed(parentA, parentB, [child], {
      crossoverMode: 'smart',
      mutationStrength: 0.3,
    })
    const node = getNode(contentHash(child))!
    expect(node.parentA).toBe(contentHash(parentA))
    expect(node.parentB).toBe(contentHash(parentB))
    expect(node.generation).toBe(1)
    expect(node.crossoverMode).toBe('smart')
    expect(node.mutationStrength).toBe(0.3)
    expect(getChildrenOf(contentHash(parentA)).map((n) => n.hash)).toEqual([
      contentHash(child),
    ])
  })

  it('numbers each child generation as max(parent generations) + 1', () => {
    const { mate, parent, grandchild } = buildLineage()
    expect(getNode(contentHash(mate))!.generation).toBe(0)
    expect(getNode(contentHash(parent))!.generation).toBe(1)
    expect(getNode(contentHash(grandchild))!.generation).toBe(2)
  })

  it('keeps existing nodes when re-recording the same breed', () => {
    const parentA = makeFlame('A')
    const parentB = makeFlame('B')
    const child = makeFlame('Child')
    recordBreed(parentA, parentB, [child], { crossoverMode: 'uniform' })
    const original = getNode(contentHash(child))!
    recordBreed(parentA, parentB, [child], { crossoverMode: 'smart' })
    expect(getNode(contentHash(child))).toBe(original)
    expect(getNode(contentHash(child))!.crossoverMode).toBe('uniform')
    expect(Object.keys(getAncestryNodes())).toHaveLength(3)
  })

  it('snapshots parent flames instead of aliasing the live object', () => {
    const parentA = makeFlame('Live')
    recordBreed(parentA, makeFlame('Other'), [makeFlame('Child')])
    const stored = getNode(contentHash(parentA))!
    expect(stored.flame).not.toBe(parentA)
    // Callers may pass the live workspace store — mutating the input after
    // recording must not leak into the stored snapshot
    firstTransform(parentA).probability = 0.123
    expect(firstTransform(stored.flame).probability).toBe(1)
  })
})

describe('ensureNode', () => {
  it('creates a snapshotted root node exactly once', () => {
    const flame = makeFlame('Root')
    ensureNode(flame)
    const node = getNode(contentHash(flame))!
    expect(node.generation).toBe(0)
    expect(node.parentA).toBeNull()
    expect(node.parentB).toBeNull()
    expect(node.flame).not.toBe(flame)
    ensureNode(flame)
    expect(getNode(contentHash(flame))).toBe(node)
    expect(Object.keys(getAncestryNodes())).toHaveLength(1)
  })
})

describe('getLineageTree', () => {
  it('returns no layers for an unknown hash', () => {
    expect(getLineageTree('0000000000000000')).toEqual([])
  })

  it('layers ancestors, the focal node, and descendants by generation', () => {
    const { gpA, gpB, parent, mate, grandchild } = buildLineage()
    const tree = getLineageTree(contentHash(parent))
    expect(tree.map((l) => l.generation)).toEqual([0, 1, 2])
    expect(tree.map((l) => l.isFocal)).toEqual([false, true, false])
    const layers = tree.map((l) => l.nodes.map((n) => n.hash).sort())
    // The mate belongs to the grandchild's other bloodline, not to the
    // focal node's own ancestry
    expect(layers[0]).toEqual([contentHash(gpA), contentHash(gpB)].sort())
    expect(layers[0]).not.toContain(contentHash(mate))
    expect(layers[1]).toEqual([contentHash(parent)])
    expect(layers[2]).toEqual([contentHash(grandchild)])
  })

  it('includes both bloodlines when focused on a descendant', () => {
    const { gpA, gpB, parent, mate, grandchild } = buildLineage()
    const tree = getLineageTree(contentHash(grandchild))
    expect(tree.map((l) => l.generation)).toEqual([0, 1, 2])
    expect(tree.map((l) => l.isFocal)).toEqual([false, false, true])
    expect(tree[0]!.nodes.map((n) => n.hash).sort()).toEqual(
      [contentHash(gpA), contentHash(gpB), contentHash(mate)].sort(),
    )
    expect(tree[1]!.nodes.map((n) => n.hash)).toEqual([contentHash(parent)])
  })

  it('renders a lone root as its own focal layer', () => {
    const flame = makeFlame('Lone Root')
    ensureNode(flame)
    const tree = getLineageTree(contentHash(flame))
    expect(tree).toHaveLength(1)
    expect(tree[0]!.generation).toBe(0)
    expect(tree[0]!.isFocal).toBe(true)
    expect(tree[0]!.nodes.map((n) => n.hash)).toEqual([contentHash(flame)])
  })
})
