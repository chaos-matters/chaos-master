import { createMemo, createSignal, For, Index, Show } from 'solid-js'
import { ModalTitleBar } from '@/components/Modal/ModalTitleBar'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import { recordBreed } from '@/flame/ancestry'
import { breedFlames } from '@/flame/breedFlame'
import { deepClone } from '@/utils/clone'
import ui from './EvolutionChamber.module.css'
import type { CrossoverMode } from '@/flame/breedFlame'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HardwareTier } from '@/utils/hardwareTier'

const COUNT_OPTIONS = [9, 18, 32] as const
const CROSSOVER_MODES: CrossoverMode[] = [
  'uniform',
  'weighted',
  'shuffle',
  'alternate',
  'smart',
]
const CROSSOVER_LABELS: Record<CrossoverMode, string> = {
  uniform: 'Uniform',
  weighted: 'Weighted',
  shuffle: 'Shuffle',
  alternate: 'Alternate',
  smart: 'Smart',
}

// ── Preview resolution by hardware tier ────────────────────────────────────

const PREVIEW_RESOLUTION: Record<
  HardwareTier,
  { width: number; height: number }
> = {
  low: { width: 256, height: 144 },
  mid: { width: 384, height: 216 },
  high: { width: 640, height: 360 },
  ultra: { width: 768, height: 432 },
}

// ── Types ──────────────────────────────────────────────────────────────────

interface GenerationData {
  generation: number
  parents: [FlameDescriptor, FlameDescriptor]
  parentNames: [string, string]
  children: FlameDescriptor[]
  crossoverMode: CrossoverMode
  mutationStrength: number
}

export interface EvolutionChamberParentInfo {
  nameA: string
  nameB: string
}

// ── Component ──────────────────────────────────────────────────────────────

export function EvolutionChamber(props: {
  parentA: FlameDescriptor
  parentB: FlameDescriptor
  parentInfo: EvolutionChamberParentInfo
  hardwareTier?: HardwareTier | null
  onApply: (flame: FlameDescriptor) => void
  onChangeParent: () => void
  onCompare?: (flameA: FlameDescriptor, flameB: FlameDescriptor) => void
  respond: () => void
}) {
  const tier = () => props.hardwareTier ?? 'mid'

  // ── Breed config ───────────────────────────────────────────────────────

  const [count, setCount] = createSignal<number>(9)
  const [crossoverMode, setCrossoverMode] =
    createSignal<CrossoverMode>('uniform')
  const [mutationStrength, setMutationStrength] = createSignal(0.1)
  const [version, setVersion] = createSignal(0)

  // ── Selected children for evolution (up to 2) ──────────────────────────

  const [selected, setSelected] = createSignal<[number, number] | null>(null)

  // ── Generations history ────────────────────────────────────────────────

  function initialBreed(): GenerationData {
    return {
      generation: 0,
      parents: [deepClone(props.parentA), deepClone(props.parentB)],
      parentNames: [props.parentInfo.nameA, props.parentInfo.nameB],
      children: doBreed(props.parentA, props.parentB),
      crossoverMode: crossoverMode(),
      mutationStrength: mutationStrength(),
    }
  }

  const [generations, setGenerations] = createSignal<GenerationData[]>([
    initialBreed(),
  ])
  const [currentGenIdx, setCurrentGenIdx] = createSignal(0)

  const currentGen = createMemo(() => generations()[currentGenIdx()]!)
  const isLatestGen = createMemo(
    () => currentGenIdx() === generations().length - 1,
  )

  // ── Selection logic ────────────────────────────────────────────────────

  function toggleSelect(childIdx: number) {
    const prev = selected()
    if (prev === null) {
      setSelected([childIdx, -1])
      return
    }

    const [a, b] = prev

    // Deselect if clicking already-selected
    if (a === childIdx) {
      // Shift B into A's position
      setSelected(b >= 0 ? [b, -1] : null)
      return
    }
    if (b === childIdx) {
      setSelected([a, -1])
      return
    }

    // Not already selected — fill first open slot
    if (a < 0) {
      setSelected([childIdx, b])
    } else if (b < 0) {
      setSelected([a, childIdx])
    } else {
      // Both slots full: replace second slot
      setSelected([a, childIdx])
    }
  }

  function clearSelection() {
    setSelected(null)
  }

  // ── Breed helpers ──────────────────────────────────────────────────────

  function breedCfg() {
    return {
      crossoverMode: crossoverMode(),
      mutationStrength: mutationStrength(),
    }
  }

  function doBreed(
    parentA: FlameDescriptor,
    parentB: FlameDescriptor,
  ): FlameDescriptor[] {
    const children = breedFlames(parentA, parentB, {
      count: count(),
      crossoverMode: crossoverMode(),
      mutationStrength: mutationStrength(),
    })
    recordBreed(parentA, parentB, children, breedCfg())
    return children
  }

  function rebreed() {
    const gen = currentGen()
    const children = doBreed(gen.parents[0], gen.parents[1])
    setGenerations((prev) => {
      const next = [...prev]
      next[currentGenIdx()] = { ...gen, children }
      return next
    })
    clearSelection()
    setVersion((v) => v + 1)
  }

  function evolve() {
    const sel = selected()
    if (!sel || sel[0] < 0) return

    const gen = currentGen()
    const children = gen.children

    const parentA = children[sel[0]]!
    // If only one selected, mutate from the same parent
    const parentB = sel[1] >= 0 ? children[sel[1]]! : deepClone(parentA)

    const newChildren = doBreed(parentA, parentB)

    const newGen: GenerationData = {
      generation: gen.generation + 1,
      parents: [deepClone(parentA), deepClone(parentB)],
      parentNames: [
        parentA.metadata?.name ?? `Child ${sel[0] + 1}`,
        parentB.metadata?.name ??
          `Child ${sel[1] >= 0 ? sel[1] + 1 : sel[0] + 1}`,
      ],
      children: newChildren,
      crossoverMode: crossoverMode(),
      mutationStrength: mutationStrength(),
    }

    setGenerations((prev) => [...prev, newGen])
    setCurrentGenIdx((prev) => prev + 1)
    clearSelection()
    setVersion((v) => v + 1)
  }

  function goBack() {
    if (currentGenIdx() > 0) {
      setCurrentGenIdx((prev) => prev - 1)
      clearSelection()
      setVersion((v) => v + 1)
    }
  }

  function goForward() {
    if (currentGenIdx() < generations().length - 1) {
      setCurrentGenIdx((prev) => prev + 1)
      clearSelection()
      setVersion((v) => v + 1)
    }
  }

  function takeMeBack() {
    // Apply the gen-0 parent A (or selected child from current gen)
    const gen = currentGen()
    const sel = selected()
    if (sel && sel[0] >= 0 && gen.children[sel[0]]) {
      props.onApply(deepClone(gen.children[sel[0]]!))
    } else {
      props.onApply(deepClone(gen.parents[0]))
    }
    props.respond()
  }

  // ── Change count/mode/mutation → re-breed current gen ──────────────────

  // Signals update synchronously, so doBreed (which reads them) sees the new
  // value right after the setter — each change re-breeds and records once.
  function changeCount(n: number) {
    setCount(n)
    const gen = currentGen()
    const children = doBreed(gen.parents[0], gen.parents[1])
    setGenerations((prev) => {
      const next = [...prev]
      next[currentGenIdx()] = { ...gen, children }
      return next
    })
    clearSelection()
    setVersion((v) => v + 1)
  }

  function changeMode(mode: CrossoverMode) {
    setCrossoverMode(mode)
    const gen = currentGen()
    const children = doBreed(gen.parents[0], gen.parents[1])
    setGenerations((prev) => {
      const next = [...prev]
      next[currentGenIdx()] = { ...gen, children, crossoverMode: mode }
      return next
    })
    clearSelection()
    setVersion((v) => v + 1)
  }

  function changeMutation(s: number) {
    setMutationStrength(s)
    const gen = currentGen()
    const children = doBreed(gen.parents[0], gen.parents[1])
    setGenerations((prev) => {
      const next = [...prev]
      next[currentGenIdx()] = { ...gen, children, mutationStrength: s }
      return next
    })
    clearSelection()
    setVersion((v) => v + 1)
  }

  // ── Preview resolution ─────────────────────────────────────────────────

  const resolution = () => PREVIEW_RESOLUTION[tier()]

  // ── Render ─────────────────────────────────────────────────────────────

  const sel = createMemo(() => selected())
  const children = createMemo(() => currentGen().children)

  return (
    <div class={ui.modal}>
      <ModalTitleBar
        onClose={() => {
          props.respond()
        }}
      >
        <span>Evolution Chamber</span>
      </ModalTitleBar>

      {/* ── Generation badge + parent names ─────────────────────────── */}

      <div class={ui.header}>
        <span class={ui.genBadge}>Gen {currentGen().generation}</span>
        <span class={ui.parentNames}>
          <span class={ui.parentName}>{currentGen().parentNames[0]}</span>
          <span class={ui.cross}>×</span>
          <span class={ui.parentName}>{currentGen().parentNames[1]}</span>
        </span>
        <div class={ui.genNav}>
          <button
            type="button"
            class={ui.genNavBtn}
            disabled={currentGenIdx() === 0}
            onClick={goBack}
            title="Previous generation"
          >
            ← Back
          </button>
          <button
            type="button"
            class={ui.genNavBtn}
            disabled={isLatestGen()}
            onClick={goForward}
            title="Next generation"
          >
            Next →
          </button>
        </div>
      </div>

      {/* ── Gen dots summary ─────────────────────────────────────────── */}

      <div class={ui.genSummary}>
        <Index each={generations()}>
          {(gen, i) => (
            <>
              {i > 0 && <span class={ui.genArrow}>→</span>}
              <span
                class={ui.genDot}
                classList={{ [ui.genDotActive!]: i === currentGenIdx() }}
                title={`Gen ${gen().generation}: ${gen().parentNames[0]} × ${gen().parentNames[1]}`}
              />
            </>
          )}
        </Index>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────── */}

      <div class={ui.toolbar}>
        <div class={ui.toolbarLeft}>
          <button
            type="button"
            class={ui.genNavBtn}
            onClick={props.onChangeParent}
            title="Pick different starting parents"
          >
            ← New Parents
          </button>
          <button
            type="button"
            class={ui.takeBackBtn}
            onClick={takeMeBack}
            title="Load the selected child (or gen-0 parent) into the workspace"
          >
            Take Flame
          </button>
          <Show when={props.onCompare}>
            <button
              type="button"
              class={ui.compareBtn}
              onClick={() => {
                const gen = currentGen()
                props.onCompare?.(gen.parents[0], gen.parents[1])
              }}
              title="Diff the two current-generation parents"
            >
              Compare Parents
            </button>
          </Show>
          {isLatestGen() && children().length > 0 && (
            <span class={ui.selectHint}>
              Select <strong>1–2</strong> children, then Evolve
            </span>
          )}
        </div>
        <div class={ui.toolbarRight}>
          <div class={ui.countChips}>
            <For each={COUNT_OPTIONS}>
              {(n) => (
                <button
                  type="button"
                  class={ui.chip}
                  classList={{ [ui.chipActive!]: count() === n }}
                  onClick={() => {
                    changeCount(n)
                  }}
                >
                  {n}
                </button>
              )}
            </For>
          </div>
          <div class={ui.crossoverChips}>
            <For each={CROSSOVER_MODES}>
              {(mode) => (
                <button
                  type="button"
                  class={ui.chip}
                  classList={{
                    [ui.chipActive!]: crossoverMode() === mode,
                  }}
                  onClick={() => {
                    changeMode(mode)
                  }}
                  title={`${CROSSOVER_LABELS[mode]} crossover`}
                >
                  {CROSSOVER_LABELS[mode]}
                </button>
              )}
            </For>
          </div>
          <button type="button" class={ui.rebreedBtn} onClick={rebreed}>
            Re-breed
          </button>
          <button
            type="button"
            class={ui.evolveBtn}
            disabled={!sel() || sel()![0] < 0}
            onClick={evolve}
          >
            Evolve →
          </button>
        </div>
      </div>

      {/* ── Mutation slider ──────────────────────────────────────────── */}

      <div class={ui.mutationRow}>
        <span class={ui.mutationLabel}>Mutation</span>
        <input
          type="range"
          class={ui.mutationSlider}
          min={0}
          max={0.5}
          step={0.01}
          value={mutationStrength()}
          onInput={(e) => {
            changeMutation(e.currentTarget.valueAsNumber)
          }}
          title="Mutation strength"
        />
        <span class={ui.mutationValue}>
          {(mutationStrength() * 100).toFixed(0)}%
        </span>
      </div>

      {/* ── Children grid ────────────────────────────────────────────── */}

      <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
        <div class={ui.body}>
          <div class={ui.grid}>
            <For each={children()}>
              {(child, i) => {
                const isP1 = () => sel()?.[0] === i()
                const isP2 = () => sel()?.[1] === i()
                const childName = () =>
                  child.metadata?.name ?? `Child ${i() + 1}`

                return (
                  <button
                    type="button"
                    class={ui.cell}
                    classList={{
                      [ui.cellParent1!]: isP1(),
                      [ui.cellParent2!]: isP2(),
                    }}
                    title={childName()}
                    aria-label={`Select ${childName()}`}
                    aria-pressed={isP1() || isP2()}
                    onClick={() => {
                      toggleSelect(i())
                    }}
                    onDblClick={() => {
                      // Double-click to apply immediately
                      props.onApply(deepClone(child))
                      props.respond()
                    }}
                  >
                    <div class={ui.previewLayer}>
                      <VariationPreview
                        version={version()}
                        isSelected={isP1() || isP2()}
                        flame={child}
                        name={`evo-${currentGen().generation}-${i()}`}
                        hardwareTier={tier()}
                        resolution={resolution()}
                      />
                    </div>
                    {isP1() && (
                      <span class={`${ui.badge} ${ui.badgeParent1}`}>1</span>
                    )}
                    {isP2() && (
                      <span class={`${ui.badge} ${ui.badgeParent2}`}>2</span>
                    )}
                  </button>
                )
              }}
            </For>
          </div>
        </div>
      </ComputeGate>
    </div>
  )
}
