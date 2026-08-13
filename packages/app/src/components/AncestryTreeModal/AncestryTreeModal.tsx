import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js'
import { ModalTitleBar } from '@/components/Modal/ModalTitleBar'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import { contentHash, ensureNode, getLineageTree, getPedigreeTree, } from '@/flame/ancestry'
import { diffFlames } from '@/flame/fdiff'
import { Lineage } from '@/icons'
import ui from './AncestryTreeModal.module.css'
import type { AncestryNode } from '@/flame/ancestry'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HardwareTier } from '@/utils/hardwareTier'

const PREVIEW_RES = { width: 240, height: 136 }

function tooltipText(node: AncestryNode): string {
  const parts = [node.name, `Generation: ${node.generation}`]
  if (node.crossoverMode) {
    parts.push(`Crossover: ${node.crossoverMode}`)
  }
  if (node.mutationStrength !== undefined) {
    parts.push(`Mutation: ${(node.mutationStrength * 100).toFixed(0)}%`)
  }
  if (node.createdAt) {
    parts.push(`Created: ${new Date(node.createdAt).toLocaleDateString()}`)
  }
  return parts.join('\n')
}

/**
 * Horizontal ancestry tree modal.
 * Shows ancestors to the left, focal flame in the centre, descendants to the right.
 * Click any node to make it the new focal point; click "Load" to apply the selected flame.
 */
export function AncestryTreeModal(props: {
  flame: FlameDescriptor
  hardwareTier?: HardwareTier | null
  onApply: (flame: FlameDescriptor) => void
  onCompare?: (flameA: FlameDescriptor, flameB: FlameDescriptor) => void
  respond: () => void
}) {
  const [focalHash, setFocalHash] = createSignal(contentHash(props.flame))
  const [selectedHash, setSelectedHash] = createSignal<string | null>(null)
  const [version, setVersion] = createSignal(0)

  // Auto-register the current workspace flame so it always has at least a
  // root node in the ancestry store, even if it was loaded from gallery or
  // imported rather than bred. `on` keeps the effect keyed to the workspace
  // flame only — a plain createEffect would also track focalHash and snap the
  // tree back to the workspace flame right after every node click.
  createEffect(
    on(
      () => props.flame,
      (flame) => {
        const hash = contentHash(flame)
        ensureNode(flame)
        if (hash !== focalHash()) {
          setFocalHash(hash)
          setVersion((v) => v + 1)
        }
      },
    ),
  )

  /**
   * Two ways to read the same records.
   *
   * `generations` groups by how many breeding steps a flame is from a founder.
   * That is a property of the flame itself, so a mate introduced late still
   * sits in Gen 0 beside the original grandparents — correct, and confusing
   * when the question was "who are this flame's parents".
   *
   * `pedigree` measures outward from the focal flame instead — parents above,
   * children below — so both parents of a child are always adjacent to it and
   * it reads top-to-bottom like a human family tree.
   */
  const [viewMode, setViewMode] = createSignal<'generations' | 'pedigree'>(
    'generations',
  )

  /** Either layout, flattened to what the renderer needs. */
  type DisplayLayer = {
    label: string
    nodes: AncestryNode[]
    isFocal: boolean
  }

  const layers = createMemo<DisplayLayer[]>(() => {
    // Version signal triggers recompute when focal changes
    void version()
    if (viewMode() === 'pedigree') {
      // Already ordered oldest-first by getPedigreeTree.
      return getPedigreeTree(focalHash()).map((layer) => ({
        label: layer.isFocal
          ? 'Current'
          : layer.direction === 'ancestor'
            ? layer.depth === 1
              ? 'Parents'
              : layer.depth === 2
                ? 'Grandparents'
                : `${layer.depth} back`
            : layer.depth === 1
              ? 'Children'
              : layer.depth === 2
                ? 'Grandchildren'
                : `${layer.depth} on`,
        nodes: layer.nodes,
        isFocal: layer.isFocal,
      }))
    }
    return getLineageTree(focalHash()).map((layer) => ({
      label: layer.isFocal ? 'Current' : `Gen ${layer.generation}`,
      nodes: layer.nodes,
      isFocal: layer.isFocal,
    }))
  })

  const selectedNode = createMemo<AncestryNode | undefined>(() => {
    const hash = selectedHash()
    if (!hash) return undefined
    for (const layer of layers()) {
      const found = layer.nodes.find((n) => n.hash === hash)
      if (found) return found
    }
    return undefined
  })

  function handleNodeClick(node: AncestryNode) {
    setSelectedHash(node.hash)
    setFocalHash(node.hash)
    setVersion((v) => v + 1)
  }

  function handleLoad() {
    const node = selectedNode()
    if (node) {
      props.onApply(node.flame)
      props.respond()
    }
  }

  function handleCompare() {
    const node = selectedNode()
    if (!node || !props.onCompare) return
    // Compare with parent A, or with the focal/workspace flame
    if (node.parentA) {
      for (const layer of layers()) {
        const parent = layer.nodes.find((n) => n.hash === node.parentA)
        if (parent) {
          props.onCompare(node.flame, parent.flame)
          return
        }
      }
    }
    // Fallback: compare with the workspace flame
    props.onCompare(node.flame, props.flame)
  }

  // Build a flat lookup for parent similarity computation
  const allNodes = createMemo(() => {
    const map: Record<string, AncestryNode> = {}
    for (const layer of layers()) {
      for (const node of layer.nodes) {
        map[node.hash] = node
      }
    }
    return map
  })

  return (
    <div class={ui.modal}>
      <ModalTitleBar
        onClose={() => {
          props.respond()
        }}
      >
        <span>Ancestry Tree</span>
        {/* Two readings of the same records — see the `viewMode` comment. */}
        <div class={ui.viewToggle} role="radiogroup" aria-label="Tree layout">
          <For each={['generations', 'pedigree'] as const}>
            {(mode) => (
              <button
                type="button"
                class={ui.viewToggleBtn}
                classList={{
                  [ui.viewToggleBtnActive as string]: viewMode() === mode,
                }}
                role="radio"
                aria-checked={viewMode() === mode}
                onClick={() => {
                  setViewMode(mode)
                }}
                title={
                  mode === 'generations'
                    ? 'Group by breeding depth from a founder'
                    : "This flame's parents and theirs, drawn as a family tree"
                }
              >
                {mode === 'generations' ? 'Generations' : 'Pedigree'}
              </button>
            )}
          </For>
        </div>
      </ModalTitleBar>

      <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
        <Show
          when={layers().length > 0}
          fallback={
            <div class={ui.emptyState}>
              <span class={ui.emptyIcon}>
                <Lineage />
              </span>
              <span class={ui.emptyMessage}>
                No ancestry recorded for this flame yet.
              </span>
              <span class={ui.emptyHint}>
                Breed, evolve, or blend flames to build up an ancestry tree
                here.
              </span>
            </div>
          }
        >
          <div
            class={ui.tree}
            classList={{
              [ui.treeVertical as string]: viewMode() === 'pedigree',
            }}
          >
            <For each={layers()}>
              {(layer, layerIdx) => (
                <>
                  <Show
                    when={(() => {
                      if (layerIdx() <= 0) return false
                      const prev = layers()[layerIdx() - 1]
                      return (
                        prev !== undefined &&
                        prev.nodes.length > 0 &&
                        layer.nodes.length > 0
                      )
                    })()}
                  >
                    <div class={ui.layerConnector}>
                      <div class={ui.connectorLine} />
                      <For each={layer.nodes}>
                        {(node) => {
                          const parent = node.parentA
                            ? allNodes()[node.parentA]
                            : undefined
                          const edgeSim = parent
                            ? (() => {
                                try {
                                  return diffFlames(node.flame, parent.flame)
                                    .overallSimilarity
                                } catch {
                                  return undefined
                                }
                              })()
                            : undefined
                          const esColor = () => {
                            if (edgeSim === undefined) return undefined
                            if (edgeSim >= 85) return '#4caf50'
                            if (edgeSim >= 60) return '#ffc107'
                            return '#f44336'
                          }
                          // Already a percentage — the thresholds above compare
                          // it against 85 and 60. The tooltip used to multiply
                          // by 100 on top, so a 84% edge read "8400% similar".
                          return (
                            <Show when={edgeSim !== undefined}>
                              <span
                                class={ui.edgeLabel}
                                style={{
                                  color: esColor(),
                                  background: `${esColor()}18`,
                                  'border-color': `${esColor()}33`,
                                }}
                                title={`${edgeSim!.toFixed(0)}% similar to ${parent!.name}`}
                              >
                                {edgeSim!.toFixed(0)}%
                              </span>
                            </Show>
                          )
                        }}
                      </For>
                    </div>
                  </Show>
                  <div class={ui.layer}>
                    <span class={ui.layerLabel}>{layer.label}</span>
                    <div class={ui.layerNodes}>
                      <For each={layer.nodes}>
                        {(node) => (
                          <AncestryNodeCard
                            node={node}
                            isFocal={layer.isFocal}
                            isSelected={
                              selectedHash() === node.hash && !layer.isFocal
                            }
                            version={version()}
                            hardwareTier={props.hardwareTier}
                            allNodes={allNodes()}
                            onClick={() => {
                              handleNodeClick(node)
                            }}
                          />
                        )}
                      </For>
                    </div>
                    <Show when={layer.nodes.length === 0}>
                      <div class={ui.nodeEmpty}>—</div>
                    </Show>
                  </div>
                </>
              )}
            </For>
          </div>
        </Show>
      </ComputeGate>

      <div class={ui.actions}>
        <Show when={selectedNode()} keyed>
          {(node) => (
            <>
              <span class={ui.selectedInfo}>
                Selected: {node.name} (gen {node.generation})
                <Show when={node.crossoverMode}>
                  {' · '}
                  {node.crossoverMode}
                </Show>
              </span>
              <Show when={props.onCompare}>
                <button
                  type="button"
                  class={ui.compareBtn}
                  onClick={handleCompare}
                  title="Compare selected node with its parent"
                >
                  Diff vs Parent
                </button>
              </Show>
            </>
          )}
        </Show>
        <button
          type="button"
          class={ui.loadBtn}
          disabled={!selectedNode() || selectedHash() === focalHash()}
          onClick={handleLoad}
        >
          {selectedHash() === focalHash() ? 'Already loaded' : 'Load selected'}
        </button>
      </div>
    </div>
  )
}

/** Compute similarity between a node and its parentA (memoized per-node). */
function useParentSimilarity(
  node: AncestryNode,
  allNodes: Record<string, AncestryNode>,
): number | undefined {
  if (!node.parentA) return undefined
  const parent = allNodes[node.parentA]
  if (!parent) return undefined
  try {
    return diffFlames(node.flame, parent.flame).overallSimilarity
  } catch {
    return undefined
  }
}

/** Single ancestry node card with similarity badge. */
function AncestryNodeCard(props: {
  node: AncestryNode
  isFocal: boolean
  isSelected: boolean
  version: number
  hardwareTier?: HardwareTier | null
  allNodes: Record<string, AncestryNode>
  onClick: () => void
}) {
  const similarity = createMemo(() =>
    useParentSimilarity(props.node, props.allNodes),
  )
  const simColor = () => {
    const s = similarity()
    if (s === undefined) return undefined
    if (s >= 85) return '#4caf50'
    if (s >= 60) return '#ffc107'
    return '#f44336'
  }
  const simBg = () => {
    const c = simColor()
    if (!c) return undefined
    return `${c}22`
  }

  return (
    <button
      type="button"
      class={ui.node}
      classList={{
        [ui.nodeFocal!]: props.isFocal,
        [ui.nodeSelected!]: props.isSelected,
      }}
      onClick={props.onClick}
      title={tooltipText(props.node)}
    >
      <div class={ui.thumb}>
        <div class={ui.thumbInner}>
          <VariationPreview
            version={props.version}
            isSelected={false}
            flame={props.node.flame}
            name={`ancestry-${props.node.hash}`}
            hardwareTier={props.hardwareTier ?? null}
            resolution={PREVIEW_RES}
          />
        </div>
      </div>
      <span class={ui.nodeName}>{props.node.name}</span>
      <span class={ui.nodeGen}>
        gen {props.node.generation}
        <Show when={props.node.crossoverMode}>
          <span class={ui.nodeCrossover}> · {props.node.crossoverMode}</span>
        </Show>
      </span>
      <Show when={similarity() !== undefined}>
        <span
          class={ui.similarityBadge}
          style={{
            color: simColor(),
            background: simBg(),
            'border-color': `${simColor()}44`,
          }}
          title="Similarity to parent"
        >
          {similarity()!.toFixed(0)}%
        </span>
      </Show>
    </button>
  )
}
