import { createSignal, For, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { vec2f, vec4f } from 'typegpu/data'
import { Checkbox } from '@/components/Checkbox/Checkbox'
import { DEFAULT_VARIATION_PREVIEW_POINT_COUNT } from '@/defaults'
import { examples } from '@/flame/examples'
import { Flam3 } from '@/flame/Flam3'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Root } from '@/lib/Root'
import { loadRecentFlames } from '@/utils/recentFlames'
import ui from './WelcomeScreen.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

type WelcomeScreenProps = {
  showDontShowAgain?: boolean
  onDontShowAgainChange?: (checked: boolean, ev: Event) => void
  onEnter: () => void
  onSelectFlame?: (flame: FlameDescriptor) => void
  onStartTour?: (tourId: string) => void
}

type GalleryItem = {
  id: string
  name: string
  flame: FlameDescriptor
}

function FlameThumbnail(props: {
  flame: FlameDescriptor
  name: string
  onClick?: (flame: FlameDescriptor) => void
}) {
  const [hovered, setHovered] = createSignal(false)

  return (
    <button
      class={ui.thumbnail}
      onClick={() => props.onClick?.(props.flame)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={props.name}
    >
      <Root adapterOptions={{ powerPreference: 'high-performance' }}>
        <AutoCanvas pixelRatio={1}>
          <Camera2D
            position={vec2f(...props.flame.renderSettings.camera.position)}
            zoom={props.flame.renderSettings.camera.zoom}
          >
            <Flam3
              quality={hovered() ? 0.999 : 0.95}
              pointCountPerBatch={DEFAULT_VARIATION_PREVIEW_POINT_COUNT}
              adaptiveFilterEnabled={false}
              animationEnabled={false}
              flameDescriptor={props.flame}
              renderInterval={1}
              onExportImage={undefined}
              edgeFadeColor={vec4f(0)}
            />
          </Camera2D>
        </AutoCanvas>
      </Root>
      <span class={ui.thumbnailLabel}>{props.name}</span>
    </button>
  )
}

export function WelcomeScreen(props: WelcomeScreenProps) {
  const recents = () => loadRecentFlames().slice(0, 4)

  const allExamples: GalleryItem[] = Object.entries(examples).map(
    ([id, flame]) => ({
      id,
      name: id,
      flame,
    }),
  )

  const recentItems: GalleryItem[] = recents().map((r) => ({
    id: r.id,
    name: r.name,
    flame: r.flame,
  }))

  const handleSelect = (flame: FlameDescriptor) => {
    props.onSelectFlame?.(flame)
    props.onEnter()
  }

  return (
    <Portal>
      <div
        class={ui.backdrop}
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onEnter()
        }}
      >
        <div class={ui.card}>
          <div class={ui.gallerySection}>
            <div class={ui.galleryHeader}>
              <span class={ui.galleryTitle}>Recent</span>
            </div>
            <Show
              when={recentItems.length > 0}
              fallback={
                <div class={ui.galleryEmpty}>
                  <span>No recent flames yet</span>
                </div>
              }
            >
              <div class={ui.galleryGrid}>
                <For each={recentItems}>
                  {(item) => (
                    <FlameThumbnail
                      flame={item.flame}
                      name={item.name}
                      onClick={handleSelect}
                    />
                  )}
                </For>
              </div>
            </Show>

            <div class={ui.galleryHeader} style={{ 'margin-top': '1.25rem' }}>
              <span class={ui.galleryTitle}>Examples</span>
            </div>
            <div class={ui.galleryGrid}>
              <For each={allExamples}>
                {(item) => (
                  <FlameThumbnail
                    flame={item.flame}
                    name={item.name}
                    onClick={handleSelect}
                  />
                )}
              </For>
            </div>
          </div>

          <div class={ui.content}>
            <div class={ui.branding}>
              <h1 class={ui.title}>Chaos Master</h1>
              <p class={ui.subtitle}>
                Create beautiful fractal flames with WebGPU
              </p>
            </div>

            <Show when={props.onStartTour}>
              <div class={ui.tourSection}>
                <span class={ui.tourSectionTitle}>Guided Tours</span>
                <div class={ui.tourButtons}>
                  <button
                    class={ui.tourBtn}
                    onClick={() => props.onStartTour?.('app')}
                  >
                    <span class={ui.tourBtnTitle}>App Tour</span>
                    <span class={ui.tourBtnSubtitle}>
                      Canvas, controls &amp; sharing
                    </span>
                  </button>
                  <button
                    class={ui.tourBtn}
                    onClick={() => props.onStartTour?.('sidebar')}
                  >
                    <span class={ui.tourBtnTitle}>Sidebar Tour</span>
                    <span class={ui.tourBtnSubtitle}>
                      Parameters, variations &amp; editing
                    </span>
                  </button>
                  <button
                    class={ui.tourBtn}
                    onClick={() => props.onStartTour?.('timeline')}
                  >
                    <span class={ui.tourBtnTitle}>Timeline Tour</span>
                    <span class={ui.tourBtnSubtitle}>
                      Animation &amp; keyframes
                    </span>
                  </button>
                </div>
              </div>
            </Show>

            <div class={ui.actions}>
              <button class={ui.startBtn} onClick={props.onEnter}>
                Start
              </button>

              <label class={ui.dontShow}>
                <Checkbox
                  checked={props.showDontShowAgain ?? false}
                  onChange={(checked, ev) => {
                    props.onDontShowAgainChange?.(checked, ev)
                  }}
                />
                <span>Don't show on startup</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}
