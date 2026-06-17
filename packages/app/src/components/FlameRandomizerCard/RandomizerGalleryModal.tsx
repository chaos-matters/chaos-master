import { createSignal, For, Show } from 'solid-js'
import { ModalTitleBar } from '@/components/Modal/ModalTitleBar'
import { generateRandomFlame, mutateFlame } from '@/flame/randomize'
import { Root } from '@/lib/Root'
import { GalleryGrid } from './GalleryGrid'
import ui from './RandomizerGalleryModal.module.css'
import type { GenerateRandomFlameConfig, MutateFlameOptions, } from '@/flame/randomize'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HardwareTier } from '@/utils/hardwareTier'

const COUNT_OPTIONS = [9, 18, 32, 64] as const

/** One level of the breeding stack: a page of candidates. `source` is set for
 *  mutation pages so re-roll regenerates mutations of the same flame. */
type GalleryPage = {
  title: string
  source?: FlameDescriptor
  candidates: FlameDescriptor[]
}

export function RandomizerGalleryModal(props: {
  buildConfig: () => GenerateRandomFlameConfig
  buildMutationOptions: () => MutateFlameOptions
  hardwareTier?: HardwareTier | null
  onApply: (flame: FlameDescriptor) => void
  /** When provided, open directly on a page of mutations of this flame. */
  initialSource?: FlameDescriptor
  respond: () => void
}) {
  const [count, setCount] = createSignal<number>(9)
  const [version, setVersion] = createSignal(0)
  // Preview cell min-width (px) and a CSS brightness multiplier for inspection.
  const [cellSize, setCellSize] = createSignal(190)
  const [brightness, setBrightness] = createSignal(1)

  const makeRandom = (n: number): FlameDescriptor[] => {
    const config = props.buildConfig()
    return Array.from({ length: n }, () => generateRandomFlame(config))
  }
  const makeMutations = (
    source: FlameDescriptor,
    n: number,
  ): FlameDescriptor[] => {
    const config = props.buildConfig()
    const options = props.buildMutationOptions()
    return Array.from({ length: n }, () => mutateFlame(source, config, options))
  }

  const [pages, setPages] = createSignal<GalleryPage[]>(
    props.initialSource
      ? [
          {
            title: 'Mutations',
            source: props.initialSource,
            candidates: makeMutations(props.initialSource, count()),
          },
        ]
      : [{ title: 'Random flames', candidates: makeRandom(count()) }],
  )

  const current = () => pages()[pages().length - 1]
  const depth = () => pages().length - 1

  const regenCurrent = () => {
    setPages((ps) => {
      const next = [...ps]
      const cur = next[next.length - 1]!
      next[next.length - 1] = {
        ...cur,
        candidates: cur.source
          ? makeMutations(cur.source, count())
          : makeRandom(count()),
      }
      return next
    })
    setVersion((v) => v + 1)
  }

  const chooseCount = (n: number) => {
    setCount(n)
    regenCurrent()
  }

  const mutate = (source: FlameDescriptor) => {
    setPages((ps) => [
      ...ps,
      {
        title: 'Mutations',
        source,
        candidates: makeMutations(source, count()),
      },
    ])
    setVersion((v) => v + 1)
  }

  const back = () => {
    setPages((ps) => (ps.length > 1 ? ps.slice(0, -1) : ps))
    setVersion((v) => v + 1)
  }

  const apply = (flame: FlameDescriptor) => {
    props.onApply(flame)
    props.respond()
  }

  return (
    <div class={ui.modal}>
      <ModalTitleBar
        onClose={() => {
          props.respond()
        }}
      >
        <span>Flame Gallery</span>
      </ModalTitleBar>

      <div class={ui.toolbar}>
        <div class={ui.toolbarLeft}>
          <Show when={depth() > 0}>
            <button type="button" class={ui.backBtn} onClick={back}>
              ← Back
            </button>
          </Show>
          <span class={ui.crumb}>
            {current()?.title}
            <Show when={depth() > 0}>
              <span class={ui.depthTag}> · depth {depth()}</span>
            </Show>
          </span>
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
                    chooseCount(n)
                  }}
                >
                  {n}
                </button>
              )}
            </For>
          </div>
          <button type="button" class={ui.rerollBtn} onClick={regenCurrent}>
            Re-roll
          </button>
        </div>
      </div>

      <div class={ui.controls}>
        <div class={ui.sliderRow} title={`Preview size: ${cellSize()}px`}>
          <svg class={ui.sliderIcon} viewBox="0 0 16 16" fill="currentColor">
            <rect x="5" y="5" width="6" height="6" rx="1" />
          </svg>
          <input
            type="range"
            class={ui.slider}
            min={120}
            max={360}
            step={10}
            value={cellSize()}
            onInput={(e) => setCellSize(e.currentTarget.valueAsNumber)}
          />
          <svg class={ui.sliderIcon} viewBox="0 0 16 16" fill="currentColor">
            <rect x="2" y="2" width="12" height="12" rx="1.5" />
          </svg>
        </div>
        <div
          class={ui.sliderRow}
          title={`Brightness: ${brightness().toFixed(2)}×`}
        >
          <svg
            class={ui.sliderIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
          <input
            type="range"
            class={ui.slider}
            min={0.3}
            max={2.5}
            step={0.05}
            value={brightness()}
            onInput={(e) => setBrightness(e.currentTarget.valueAsNumber)}
          />
          <span class={ui.sliderValue}>{brightness().toFixed(1)}×</span>
        </div>
      </div>

      <div class={ui.body}>
        {/* The modal is Portal'd outside the app's <Root>, so AutoCanvas inside
            the previews can't see the app's RootContext — provide a fresh Root
            here (same pattern as LoadFlameModal). GalleryGrid supplies its own
            ComputeGate. */}
        <Root adapterOptions={{ powerPreference: 'high-performance' }}>
          <GalleryGrid
            candidates={current()?.candidates ?? []}
            version={version()}
            hardwareTier={props.hardwareTier}
            onApply={apply}
            onMutate={mutate}
            minCellWidth={`${cellSize()}px`}
            maxHeight="70vh"
            brightness={brightness()}
          />
        </Root>
      </div>
    </div>
  )
}
