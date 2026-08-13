import { createMemo, createSignal, For, Show } from 'solid-js'
import { GalleryGrid } from '@/components/FlameRandomizerCard/GalleryGrid'
import { ModalTitleBar } from '@/components/Modal/ModalTitleBar'
import { recordBreed } from '@/flame/ancestry'
import { analyzeSmartBreedMatch, breedFlames, CROSSOVER_LABELS, CROSSOVER_MODES, } from '@/flame/breedFlame'
import { mutateFlame } from '@/flame/randomize'
import { Sparkle } from '@/icons'
import { Root } from '@/lib/Root'
import ui from './BreedGallery.module.css'
import type { CrossoverMode, SmartBreedMatchInfo } from '@/flame/breedFlame'
import type { GenerateRandomFlameConfig } from '@/flame/randomize'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HardwareTier } from '@/utils/hardwareTier'

const COUNT_OPTIONS = [9, 18, 32] as const

export type BreedGalleryParentInfo = {
  nameA: string
  nameB: string
}

type MutationPage = {
  kind: 'mutations'
  source: FlameDescriptor
  candidates: FlameDescriptor[]
}

type BreedPage = { kind: 'breed' }

type PageState = BreedPage | MutationPage

const MUTATION_CONFIG: GenerateRandomFlameConfig = {
  strength: 0.3,
  minTransforms: 1,
  maxTransforms: 8,
  minVariations: 1,
  maxVariations: 3,
  allowedVariations: [],
  dimensions: 2,
}

const MUTATION_OPTIONS = {
  mutateAffine: true,
  affineMode: 'smart' as const,
  mutateVariations: 'modify' as const,
  mutateColors: true,
}

export function BreedGallery(props: {
  parentA: FlameDescriptor
  parentB: FlameDescriptor
  parentInfo: BreedGalleryParentInfo
  /**
   * The child that was previewed on hover, if the user got here by hovering a
   * candidate. Shown FIRST, so clicking the flame you were looking at opens a
   * gallery that still contains it — otherwise the one that made you click
   * would be the one flame missing, since every child is freshly randomised.
   */
  seedChild?: FlameDescriptor
  hardwareTier?: HardwareTier | null
  onApply: (flame: FlameDescriptor) => void
  onChangeParent: () => void
  onCompare?: (flameA: FlameDescriptor, flameB: FlameDescriptor) => void
  respond: () => void
}) {
  const [count, setCount] = createSignal<number>(9)
  const [crossoverMode, setCrossoverMode] =
    createSignal<CrossoverMode>('uniform')
  const [version, setVersion] = createSignal(0)
  const [cellSize, setCellSize] = createSignal(190)
  const [brightness, setBrightness] = createSignal(2)
  const [page, setPage] = createSignal<PageState>({ kind: 'breed' })

  const breedConfig = () => ({
    crossoverMode: crossoverMode(),
    mutationStrength: 0.1,
  })

  const breedWithRecord = (seed?: FlameDescriptor) => {
    // One fewer generated when a previewed child leads the row, so the count
    // the user picked stays the number of cells on screen.
    const generated = breedFlames(props.parentA, props.parentB, {
      count: seed === undefined ? count() : Math.max(0, count() - 1),
      crossoverMode: crossoverMode(),
      mutationStrength: 0.1,
    })
    const children = seed === undefined ? generated : [seed, ...generated]
    recordBreed(props.parentA, props.parentB, children, breedConfig())
    return children
  }

  // The seed only leads the FIRST render: re-breeding or changing the
  // crossover mode is an explicit ask for new children, and keeping a stale
  // preview pinned at the front would quietly ignore it.
  const [children, setChildren] = createSignal<FlameDescriptor[]>(
    breedWithRecord(props.seedChild),
  )

  const smartMatchInfo = createMemo<SmartBreedMatchInfo | null>(() => {
    if (crossoverMode() !== 'smart') return null
    return analyzeSmartBreedMatch(props.parentA, props.parentB)
  })

  const rebreed = () => {
    setChildren(breedWithRecord())
    setVersion((v) => v + 1)
  }

  const apply = (flame: FlameDescriptor) => {
    props.onApply(flame)
    props.respond()
  }

  const mutate = (source: FlameDescriptor) => {
    const dims = source.renderSettings.dimensions ?? 2
    const config = { ...MUTATION_CONFIG, dimensions: dims }
    setPage({
      kind: 'mutations',
      source,
      candidates: Array.from({ length: count() }, () =>
        mutateFlame(source, config, MUTATION_OPTIONS),
      ),
    })
    setVersion((v) => v + 1)
  }

  const handleMutate = (flame: FlameDescriptor) => {
    mutate(flame)
  }

  const backToBreed = () => {
    setPage({ kind: 'breed' })
    setVersion((v) => v + 1)
  }

  const changeCount = (n: number) => {
    setCount(n)
    setChildren(breedWithRecord())
    setVersion((v) => v + 1)
  }

  const changeMode = (mode: CrossoverMode) => {
    setCrossoverMode(mode)
    setChildren(breedWithRecord())
    setVersion((v) => v + 1)
  }

  const handleCompareParents = () => {
    if (props.onCompare) {
      props.onCompare(props.parentA, props.parentB)
    }
  }

  return (
    <div class={ui.modal}>
      <ModalTitleBar
        onClose={() => {
          props.respond()
        }}
      >
        <span>{page().kind === 'breed' ? 'Flame Breeding' : 'Mutations'}</span>
      </ModalTitleBar>

      <Show
        when={page().kind === 'breed'}
        fallback={
          <MutationsView
            page={page() as MutationPage}
            version={version()}
            hardwareTier={props.hardwareTier}
            cellSize={cellSize()}
            brightness={brightness()}
            onApply={apply}
            onMutate={handleMutate}
            onBack={backToBreed}
            parentInfo={props.parentInfo}
            onChangeParent={props.onChangeParent}
          />
        }
      >
        {/* ── Breed view ──────────────────────── */}
        <div class={ui.subtitle}>
          <span class={ui.parentName}>
            {props.parentInfo.nameA || 'Parent A'}
          </span>
          <span class={ui.cross}>×</span>
          <span class={ui.parentName}>
            {props.parentInfo.nameB || 'Parent B'}
          </span>
          <span class={ui.childCount}>→ {children().length} children</span>
          <Show when={props.onCompare}>
            <button
              type="button"
              class={ui.compareParentsBtn}
              onClick={handleCompareParents}
              title="Diff the two parent flames"
            >
              Compare Parents
            </button>
          </Show>
        </div>

        <div class={ui.toolbar}>
          <div class={ui.toolbarLeft}>
            <button
              type="button"
              class={ui.changeParentBtn}
              onClick={props.onChangeParent}
              title="Pick a different second parent"
            >
              ← Change Parent
            </button>
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
                    classList={{ [ui.chipActive!]: crossoverMode() === mode }}
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
            <button type="button" class={ui.rerollBtn} onClick={rebreed}>
              Re-breed
            </button>
          </div>
        </div>

        {/* ── Smart breed match info ──────────────────────── */}
        <Show when={smartMatchInfo()}>
          {(info) => (
            <div class={ui.smartInfo}>
              <span class={ui.smartInfoIcon}>
                <Sparkle />
              </span>
              <span class={ui.smartInfoLabel}>
                {info().matchedTypes.length > 0 ? (
                  <>
                    Matched: <strong>{info().matchedTypes.join(', ')}</strong>
                    {' · '}
                    {info().crossBredPairs} cross-bred pair
                    {info().crossBredPairs !== 1 ? 's' : ''}
                  </>
                ) : (
                  <>No matching variation types found between parents.</>
                )}
                <Show when={info().unmatchedA.length > 0}>
                  {' · Only A: '}
                  {info().unmatchedA.join(', ')}
                </Show>
                <Show when={info().unmatchedB.length > 0}>
                  {' · Only B: '}
                  {info().unmatchedB.join(', ')}
                </Show>
              </span>
            </div>
          )}
        </Show>

        <div class={ui.controls}>
          <div class={ui.sliderRow}>
            <span class={ui.sliderLabel}>Preview size</span>
            <input
              type="range"
              class={ui.slider}
              min={180}
              max={380}
              step={10}
              value={cellSize()}
              onInput={(e) => setCellSize(e.currentTarget.valueAsNumber)}
              title="Preview size"
            />
            <span class={ui.sliderValue}>{cellSize()}px</span>
          </div>
          <div class={ui.sliderRow}>
            <span class={ui.sliderLabel}>Brightness</span>
            <input
              type="range"
              class={ui.slider}
              min={0.3}
              max={5}
              step={0.05}
              value={brightness()}
              onInput={(e) => setBrightness(e.currentTarget.valueAsNumber)}
              title="Preview brightness"
            />
            <span class={ui.sliderValue}>{brightness().toFixed(1)}×</span>
          </div>
        </div>

        <div class={ui.body}>
          <Root adapterOptions={{ powerPreference: 'high-performance' }}>
            <GalleryGrid
              candidates={children()}
              version={version()}
              hardwareTier={props.hardwareTier}
              onApply={apply}
              onMutate={handleMutate}
              minCellWidth={`${cellSize()}px`}
              maxHeight="100%"
              brightness={brightness()}
            />
          </Root>
        </div>
      </Show>
    </div>
  )
}

/** Sub-view showing mutations of a selected flame. */
function MutationsView(props: {
  page: MutationPage
  version: number
  hardwareTier?: HardwareTier | null
  cellSize: number
  brightness: number
  onApply: (flame: FlameDescriptor) => void
  onMutate: (flame: FlameDescriptor) => void
  onBack: () => void
  parentInfo: BreedGalleryParentInfo
  onChangeParent: () => void
}) {
  return (
    <>
      <div class={ui.mutationSubtitle}>
        <button
          type="button"
          class={ui.backBtn}
          onClick={props.onBack}
          title="Back to breeding"
        >
          ← Back to breeding
        </button>
        <span class={ui.mutationSource}>
          Mutations of{' '}
          <strong>{props.page.source.metadata?.name || 'child flame'}</strong>
        </span>
        <span class={ui.childCount}>
          → {props.page.candidates.length} variations
        </span>
      </div>

      <div class={ui.controls}>
        <div class={ui.sliderRow}>
          <span class={ui.sliderLabel}>Preview size</span>
          <span class={ui.sliderValue}>{props.cellSize}px</span>
        </div>
        <div class={ui.sliderRow}>
          <span class={ui.sliderLabel}>Brightness</span>
          <span class={ui.sliderValue}>{props.brightness.toFixed(1)}×</span>
        </div>
      </div>

      <div class={ui.body}>
        <Root adapterOptions={{ powerPreference: 'high-performance' }}>
          <GalleryGrid
            candidates={props.page.candidates}
            version={props.version}
            hardwareTier={props.hardwareTier}
            onApply={props.onApply}
            onMutate={props.onMutate}
            minCellWidth={`${props.cellSize}px`}
            maxHeight="100%"
            brightness={props.brightness}
          />
        </Root>
      </div>
    </>
  )
}
