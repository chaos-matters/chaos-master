import { createSignal, For, onCleanup, Show } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { STATIC_PREVIEW_POINT_COUNT, THUMBNAIL_PREVIEW_QUALITY, } from '@/defaults'
import { examples } from '@/flame/examples'
import { Flam3 } from '@/flame/Flam3'
import { Cross } from '@/icons'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Root } from '@/lib/Root'
import { deepClone } from '@/utils/clone'
import { formatRecentDate, loadRecentFlames } from '@/utils/recentFlames'
import { recordEntries } from '@/utils/record'
import { DelayedShow } from '../DelayedShow/DelayedShow'
import ui from './BlendFlameGallery.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

type BlendFlameGalleryProps = {
  onSelect: (flame: FlameDescriptor) => void
  onPreviewBlend?: (flame: FlameDescriptor | null) => void
  onPreviewName?: (name: string | null) => void
  onClose: () => void
}

const INITIAL_VISIBLE = 10
const PREVIEW_CLEAR_DELAY = 120

function Preview(props: { flameDescriptor: FlameDescriptor }) {
  return (
    <Root adapterOptions={{ powerPreference: 'high-performance' }}>
      <AutoCanvas pixelRatio={1}>
        <Camera2D
          position={vec2f(
            ...props.flameDescriptor.renderSettings.camera.position,
          )}
          zoom={props.flameDescriptor.renderSettings.camera.zoom}
        >
          <Flam3
            quality={THUMBNAIL_PREVIEW_QUALITY}
            pointCountPerBatch={STATIC_PREVIEW_POINT_COUNT}
            adaptiveFilterEnabled={false}
            animationEnabled={false}
            flameDescriptor={props.flameDescriptor}
            renderInterval={1}
            onExportImage={undefined}
            edgeFadeColor={vec4f(0)}
            onAccumulatedPointCount={() => {}}
          />
        </Camera2D>
      </AutoCanvas>
    </Root>
  )
}

export function BlendFlameGallery(props: BlendFlameGalleryProps) {
  const [visibleRecentCount, setVisibleRecentCount] =
    createSignal(INITIAL_VISIBLE)
  const [visibleExamplesCount, setVisibleExamplesCount] =
    createSignal(INITIAL_VISIBLE)

  const allRecent = () => loadRecentFlames()

  const allExamples = () =>
    recordEntries(examples).map(([id, flame]) => ({
      id,
      name: id === 'initExample' ? 'Init' : id,
      flame,
    }))

  const showAllRecent = () => visibleRecentCount() >= allRecent().length
  const showAllExamples = () => visibleExamplesCount() >= allExamples().length

  let clearTimer: ReturnType<typeof setTimeout> | undefined

  function handleMouseEnter(flame: FlameDescriptor, name: string) {
    clearTimeout(clearTimer)
    props.onPreviewBlend?.(flame)
    props.onPreviewName?.(name)
  }

  function handleMouseLeave() {
    clearTimer = setTimeout(() => {
      props.onPreviewBlend?.(null)
      props.onPreviewName?.(null)
    }, PREVIEW_CLEAR_DELAY)
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') props.onClose()
  }

  window.addEventListener('keydown', handleKey)
  onCleanup(() => {
    window.removeEventListener('keydown', handleKey)
    clearTimeout(clearTimer)
  })

  return (
    <div class={ui.container}>
      <div class={ui.header}>
        <span class={ui.title}>Pick Blend Flame</span>
        <button class={ui.closeBtn} onClick={props.onClose} title="Close (Esc)">
          <Cross />
        </button>
      </div>

      <div class={ui.body}>
        <div>
          <div class={ui.sectionHeader}>
            <span class={ui.sectionLabel}>Recent Flames</span>
          </div>
          <Show
            when={allRecent().length > 0}
            fallback={<div class={ui.sectionEmpty}>No recent flames yet</div>}
          >
            <div class={ui.grid}>
              <For each={allRecent()}>
                {(recent, i) => (
                  <Show when={i() < visibleRecentCount()}>
                    <button
                      class={ui.thumbnail}
                      title={`${recent.name} — ${formatRecentDate(recent.savedAt)}`}
                      onClick={() => {
                        clearTimeout(clearTimer)
                        props.onSelect(deepClone(recent.flame))
                        props.onPreviewName?.(null)
                      }}
                      onMouseEnter={() => {
                        handleMouseEnter(recent.flame, recent.name)
                      }}
                      onMouseLeave={() => {
                        handleMouseLeave()
                      }}
                    >
                      <DelayedShow delayMs={i() * 30}>
                        <Preview flameDescriptor={recent.flame} />
                      </DelayedShow>
                      <div class={ui.thumbnailBar}>
                        <span class={ui.thumbnailName}>{recent.name}</span>
                        <span class={ui.thumbnailMeta}>
                          {recent.savedAt && formatRecentDate(recent.savedAt)}
                        </span>
                      </div>
                    </button>
                  </Show>
                )}
              </For>
            </div>
            <Show when={allRecent().length > INITIAL_VISIBLE}>
              <button
                class={ui.showMoreBtn}
                onClick={() =>
                  setVisibleRecentCount((c) =>
                    c >= allRecent().length
                      ? INITIAL_VISIBLE
                      : allRecent().length,
                  )
                }
              >
                {showAllRecent()
                  ? 'Show less'
                  : `Show more (${allRecent().length - INITIAL_VISIBLE} more)`}
              </button>
            </Show>
          </Show>
        </div>

        <div>
          <div class={ui.sectionHeader}>
            <span class={ui.sectionLabel}>Examples</span>
          </div>
          <div class={ui.grid}>
            <For each={allExamples()}>
              {({ name, flame }, i) => (
                <Show when={i() < visibleExamplesCount()}>
                  <button
                    class={ui.thumbnail}
                    title={name}
                    onClick={() => {
                      clearTimeout(clearTimer)
                      props.onSelect(deepClone(flame))
                      props.onPreviewName?.(null)
                    }}
                    onMouseEnter={() => {
                      handleMouseEnter(flame, name)
                    }}
                    onMouseLeave={() => {
                      handleMouseLeave()
                    }}
                  >
                    <DelayedShow delayMs={i() * 30}>
                      <Preview flameDescriptor={flame} />
                    </DelayedShow>
                    <div class={ui.thumbnailBar}>
                      <span class={ui.thumbnailName}>{name}</span>
                    </div>
                  </button>
                </Show>
              )}
            </For>
          </div>
          <Show when={allExamples().length > INITIAL_VISIBLE}>
            <button
              class={ui.showMoreBtn}
              onClick={() =>
                setVisibleExamplesCount((c) =>
                  c >= allExamples().length
                    ? INITIAL_VISIBLE
                    : allExamples().length,
                )
              }
            >
              {showAllExamples()
                ? 'Show less'
                : `Show more (${allExamples().length - INITIAL_VISIBLE} more)`}
            </button>
          </Show>
        </div>
      </div>
    </div>
  )
}
