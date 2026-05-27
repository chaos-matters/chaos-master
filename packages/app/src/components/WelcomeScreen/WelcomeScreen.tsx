import { createSignal, For, onCleanup, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { vec2f, vec4f } from 'typegpu/data'
import { Checkbox } from '@/components/Checkbox/Checkbox'
import { DEFAULT_VARIATION_PREVIEW_POINT_COUNT, THUMBNAIL_PREVIEW_QUALITY, THUMBNAIL_PREVIEW_QUALITY_HOVER, } from '@/defaults'
import { examples } from '@/flame/examples'
import { animationDefs, getAnimationFlame } from '@/flame/examples/animations'
import { Flam3 } from '@/flame/Flam3'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Root } from '@/lib/Root'
import { deepClone } from '@/utils/clone'
import { formatRecentDate, loadRecentFlames } from '@/utils/recentFlames'
import { applyTracksToFlame } from '@/utils/timeline'
import ui from './WelcomeScreen.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineTrack } from '@/utils/timeline'

type WelcomeScreenProps = {
  showDontShowAgain?: boolean
  onDontShowAgainChange?: (checked: boolean, ev: Event) => void
  onEnter: () => void
  onSelectFlame?: (flame: FlameDescriptor, tracks?: TimelineTrack[]) => void
  onStartTour?: (tourId: string) => void
}

type GalleryItem = {
  id: string
  name: string
  flame: FlameDescriptor
  tracks?: TimelineTrack[]
  savedAt?: number
}

function FlameThumbnail(props: {
  flame: FlameDescriptor
  name: string
  onClick?: (flame: FlameDescriptor) => void
  tracks?: TimelineTrack[]
  savedAt?: number
  onClickWithTracks?: (flame: FlameDescriptor, tracks?: TimelineTrack[]) => void
}) {
  const [hovered, setHovered] = createSignal(false)
  const [animFrame, setAnimFrame] = createSignal(0)
  let rafId: number | undefined
  let startTime = 0

  const TOTAL_FRAMES = 90
  const FPS = 30
  const LOOP_DURATION_MS = (TOTAL_FRAMES / FPS) * 1000

  function startAnimation() {
    startTime = globalThis.performance.now()

    function tick() {
      const elapsed = globalThis.performance.now() - startTime
      const frame =
        Math.floor((elapsed / LOOP_DURATION_MS) * TOTAL_FRAMES) % TOTAL_FRAMES
      setAnimFrame(frame)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
  }

  function stopAnimation() {
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId)
      rafId = undefined
    }
    setAnimFrame(0)
  }

  onCleanup(() => {
    if (rafId !== undefined) cancelAnimationFrame(rafId)
  })

  const hasTracks = () => !!(props.tracks && props.tracks.length > 0)

  // Derive the displayed flame -- apply tracks when animating
  const displayFlame = (): FlameDescriptor => {
    if (!hovered() || !hasTracks()) return props.flame
    const frame = animFrame()
    const clone = deepClone(props.flame)
    applyTracksToFlame(props.tracks!, clone, frame)
    return clone
  }

  return (
    <button
      class={ui.thumbnail}
      onClick={() => {
        props.onClickWithTracks?.(props.flame, props.tracks)
        props.onClick?.(props.flame)
      }}
      onMouseEnter={() => {
        setHovered(true)
        if (hasTracks()) startAnimation()
      }}
      onMouseLeave={() => {
        setHovered(false)
        stopAnimation()
      }}
      title={props.name}
    >
      <Root adapterOptions={{ powerPreference: 'high-performance' }}>
        <AutoCanvas pixelRatio={1}>
          <Camera2D
            position={vec2f(...displayFlame().renderSettings.camera.position)}
            zoom={displayFlame().renderSettings.camera.zoom}
          >
            <Flam3
              quality={
                hovered()
                  ? THUMBNAIL_PREVIEW_QUALITY_HOVER
                  : THUMBNAIL_PREVIEW_QUALITY
              }
              pointCountPerBatch={DEFAULT_VARIATION_PREVIEW_POINT_COUNT}
              adaptiveFilterEnabled={false}
              animationEnabled={false}
              flameDescriptor={displayFlame()}
              renderInterval={1}
              onExportImage={undefined}
              edgeFadeColor={vec4f(0)}
              onAccumulatedPointCount={() => {}}
            />
          </Camera2D>
        </AutoCanvas>
      </Root>
      <div class={ui.thumbnailBar}>
        <span class={ui.thumbnailName}>{props.name}</span>
        <span class={ui.thumbnailMeta}>
          {props.savedAt && formatRecentDate(props.savedAt)}
          {hasTracks() && (
            <span
              class={ui.animatedBadge}
              title={`${props.tracks!.length} animation track${props.tracks!.length !== 1 ? 's' : ''}`}
            >
              <svg
                viewBox="0 0 14 14"
                width="10"
                height="10"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M7 2 L11 7 L7 12 L3 7 Z"
                  fill="currentColor"
                  opacity="0.3"
                />
                <path d="M7 2 L11 7 L7 12 L3 7 Z" />
                <line x1="0.5" y1="5" x2="2" y2="5" opacity="0.6" />
                <line x1="0.5" y1="7" x2="2" y2="7" opacity="0.6" />
                <line x1="0.5" y1="9" x2="2" y2="9" opacity="0.6" />
              </svg>
              {props.tracks!.length}
            </span>
          )}
        </span>
      </div>
    </button>
  )
}

export function WelcomeScreen(props: WelcomeScreenProps) {
  const recents = () => loadRecentFlames()

  const INITIAL_VISIBLE = 10

  // Animated examples -- one per unique exampleId to avoid duplicates
  const animExamples: GalleryItem[] = (() => {
    const seen = new Set<string>()
    const result: GalleryItem[] = []
    for (const anim of animationDefs) {
      if (!seen.has(anim.exampleId)) {
        seen.add(anim.exampleId)
        result.push({
          id: anim.id,
          name: anim.name,
          flame: getAnimationFlame(anim),
          tracks: anim.tracks,
        })
      }
    }
    return result
  })()

  // Static examples (no animation)
  const staticExamples: GalleryItem[] = Object.entries(examples).map(
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
    tracks: r.tracks,
    savedAt: r.savedAt,
  }))

  const [showAllAnimated, setShowAllAnimated] = createSignal(false)
  const [showAllStatic, setShowAllStatic] = createSignal(false)

  const visibleAnimated = () =>
    showAllAnimated() ? animExamples : animExamples.slice(0, INITIAL_VISIBLE)
  const visibleStatic = () =>
    showAllStatic() ? staticExamples : staticExamples.slice(0, INITIAL_VISIBLE)

  const handleSelect = (flame: FlameDescriptor, tracks?: TimelineTrack[]) => {
    props.onSelectFlame?.(flame, tracks)
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
                      tracks={item.tracks}
                      savedAt={item.savedAt}
                      onClickWithTracks={handleSelect}
                    />
                  )}
                </For>
              </div>
            </Show>

            <div class={ui.galleryHeader} style={{ 'margin-top': '1.25rem' }}>
              <span class={ui.galleryTitle}>Animated Examples</span>
            </div>
            <div class={ui.galleryGrid}>
              <For each={visibleAnimated()}>
                {(item) => (
                  <FlameThumbnail
                    flame={item.flame}
                    name={item.name}
                    tracks={item.tracks}
                    onClickWithTracks={handleSelect}
                  />
                )}
              </For>
            </div>
            <Show when={animExamples.length > INITIAL_VISIBLE}>
              <button
                class={ui.showMoreBtn}
                onClick={() => setShowAllAnimated((v) => !v)}
              >
                {showAllAnimated()
                  ? 'Show less'
                  : `Show more (${animExamples.length - INITIAL_VISIBLE} more)`}
              </button>
            </Show>

            <div class={ui.galleryHeader} style={{ 'margin-top': '1.25rem' }}>
              <span class={ui.galleryTitle}>Examples</span>
            </div>
            <div class={ui.galleryGrid}>
              <For each={visibleStatic()}>
                {(item) => (
                  <FlameThumbnail
                    flame={item.flame}
                    name={item.name}
                    onClick={handleSelect}
                  />
                )}
              </For>
            </div>
            <Show when={staticExamples.length > INITIAL_VISIBLE}>
              <button
                class={ui.showMoreBtn}
                onClick={() => setShowAllStatic((v) => !v)}
              >
                {showAllStatic()
                  ? 'Show less'
                  : `Show more (${staticExamples.length - INITIAL_VISIBLE} more)`}
              </button>
            </Show>
          </div>

          <div class={ui.content}>
            <div class={ui.branding}>
              <h1 class={ui.title}>Chaos Master</h1>
              <p class={ui.subtitle}>
                Create and animate fractal flames using the chaos game algorithm
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

            <div class={ui.techPills}>
              <span class={`${ui.techPill} ${ui.techPillCyan}`}>WebGPU</span>
              <span class={`${ui.techPill} ${ui.techPillBlue}`}>TypeGPU</span>
              <span class={`${ui.techPill} ${ui.techPillGreen}`}>SolidJS</span>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}
