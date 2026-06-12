import { batch, createMemo, createSignal, ErrorBoundary, For, onCleanup, Show, } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { ComputeGate, useComputeGate } from '@/contexts/ComputeGateContext'
import { ANIMATION_PREVIEW_POINT_COUNT, COMPUTE_GATE_CAPACITY, IS_DEV, STATIC_PREVIEW_POINT_COUNT, THUMBNAIL_PREVIEW_QUALITY, THUMBNAIL_PREVIEW_QUALITY_HOVER, } from '@/defaults'
import { examples } from '@/flame/examples'
import { animationDefs, getAnimationFlame } from '@/flame/examples/animations'
import { Flam3 } from '@/flame/Flam3'
import { camera3DDefault } from '@/flame/schema/flameSchema'
import { Cross } from '@/icons'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Default3DPreviewCamera } from '@/lib/Camera3D'
import { Root } from '@/lib/Root'
import { deepClone } from '@/utils/clone'
import { extractFlameFromPng } from '@/utils/flameInPng'
import { persistentSignal } from '@/utils/persistentSignal'
import { deleteRecentFlame, formatRecentDate, loadRecentFlames, } from '@/utils/recentFlames'
import { recordEntries } from '@/utils/record'
import { applyTracksToFlame } from '@/utils/timeline'
import { useIntersectionObserver } from '@/utils/useIntersectionObserver'
import { DelayedShow } from '../DelayedShow/DelayedShow'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import { useAlert } from '../Modal/useAlert'
import { ConfirmDeleteRecentModal, dontAskDeleteRecent, } from './ConfirmDeleteRecentModal'
import ui from './LoadFlameModal.module.css'
import type { JSX } from 'solid-js'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ChangeHistory } from '@/utils/createStoreHistory'
import type { TimelineTrack } from '@/utils/timeline'

const { performance } = globalThis

export const CANCEL = 'cancel'

export type AnimationLoad = { flame: FlameDescriptor; tracks: TimelineTrack[] }

function Preview(props: {
  flameDescriptor: FlameDescriptor
  quality?: number
  pointCountPerBatch?: number
}) {
  const [container, setContainer] = createSignal<HTMLElement>()
  const intersection = useIntersectionObserver(container)
  const isVisible = createMemo(() => intersection()?.isIntersecting ?? false)
  const allowed = useComputeGate(() => ({
    isVisible: isVisible(),
    renderStatus: 'done',
    isSelected: false,
  }))

  const flameView = () => (
    <Flam3
      quality={props.quality ?? THUMBNAIL_PREVIEW_QUALITY}
      pointCountPerBatch={
        props.pointCountPerBatch ?? STATIC_PREVIEW_POINT_COUNT
      }
      adaptiveFilterEnabled={false}
      animationEnabled={false}
      flameDescriptor={props.flameDescriptor}
      renderInterval={1}
      onExportImage={undefined}
      edgeFadeColor={vec4f(0)}
      onAccumulatedPointCount={() => {}}
    />
  )
  return (
    <div
      ref={setContainer}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
      }}
    >
      <ErrorBoundary
        fallback={() => <div class={ui.previewError}>Failed to render</div>}
      >
        <Show when={allowed() || isVisible()}>
          <Root
            adapterOptions={{
              powerPreference: 'high-performance',
            }}
          >
            <AutoCanvas pixelRatio={1}>
              <Show
                when={
                  (props.flameDescriptor.renderSettings.dimensions ?? 2) === 3
                }
                fallback={
                  <Camera2D
                    position={vec2f(
                      ...props.flameDescriptor.renderSettings.camera.position,
                    )}
                    zoom={props.flameDescriptor.renderSettings.camera.zoom}
                  >
                    {flameView()}
                  </Camera2D>
                }
              >
                <Default3DPreviewCamera
                  camera3D={props.flameDescriptor.renderSettings.camera3D}
                >
                  {flameView()}
                </Default3DPreviewCamera>
              </Show>
            </AutoCanvas>
          </Root>
        </Show>
      </ErrorBoundary>
    </div>
  )
}

function FlamePreviewInner(props: {
  flame: FlameDescriptor
  hovered: boolean
}) {
  const flameView = () => (
    <Flam3
      quality={
        props.hovered
          ? THUMBNAIL_PREVIEW_QUALITY_HOVER
          : THUMBNAIL_PREVIEW_QUALITY
      }
      pointCountPerBatch={ANIMATION_PREVIEW_POINT_COUNT}
      adaptiveFilterEnabled={false}
      animationEnabled={false}
      flameDescriptor={props.flame}
      renderInterval={1}
      onExportImage={undefined}
      edgeFadeColor={vec4f(0)}
      onAccumulatedPointCount={() => {}}
    />
  )

  return (
    <Show
      when={(props.flame.renderSettings.dimensions ?? 2) === 3}
      fallback={
        <Camera2D
          position={vec2f(...props.flame.renderSettings.camera.position)}
          zoom={props.flame.renderSettings.camera.zoom}
        >
          {flameView()}
        </Camera2D>
      }
    >
      <Default3DPreviewCamera camera3D={props.flame.renderSettings.camera3D}>
        {flameView()}
      </Default3DPreviewCamera>
    </Show>
  )
}

const ANIM_TOTAL_FRAMES = 90
const ANIM_FPS = 30
const ANIM_LOOP_MS = (ANIM_TOTAL_FRAMES / ANIM_FPS) * 1000

/** AnimatedPreview -- renders the animation flame, plays on hover. */
function AnimatedPreview(props: {
  anim: (typeof animationDefs)[number]
  index: number
  onSelect: (flame: FlameDescriptor, tracks: TimelineTrack[]) => void
}) {
  const baseFlame = getAnimationFlame(props.anim)
  const [hovered, setHovered] = createSignal(false)
  const [animFrame, setAnimFrame] = createSignal(0)
  let rafId: number | undefined
  let startTime = 0

  const [container, setContainer] = createSignal<HTMLElement>()
  const intersection = useIntersectionObserver(container)
  const isVisible = createMemo(() => intersection()?.isIntersecting ?? false)
  const allowed = useComputeGate(() => ({
    isVisible: isVisible(),
    renderStatus: 'done',
    isSelected: hovered(),
  }))

  function startAnimating() {
    startTime = performance.now()

    function tick() {
      const elapsed = performance.now() - startTime
      const f =
        Math.floor((elapsed / ANIM_LOOP_MS) * ANIM_TOTAL_FRAMES) %
        ANIM_TOTAL_FRAMES
      setAnimFrame(f)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
  }

  function stopAnimating() {
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId)
      rafId = undefined
    }
    setAnimFrame(0)
  }

  onCleanup(() => {
    if (rafId !== undefined) cancelAnimationFrame(rafId)
  })

  const displayFlame = (): FlameDescriptor => {
    if (!hovered()) return baseFlame
    const clone = deepClone(baseFlame)
    applyTracksToFlame(props.anim.tracks, clone, animFrame())
    return clone
  }

  return (
    <button
      class={ui.item}
      onClick={() => {
        props.onSelect(baseFlame, [...props.anim.tracks])
      }}
      onMouseEnter={() => {
        setHovered(true)
        startAnimating()
      }}
      onMouseLeave={() => {
        setHovered(false)
        stopAnimating()
      }}
      ref={setContainer}
    >
      <Show when={allowed() || isVisible()}>
        <Root adapterOptions={{ powerPreference: 'high-performance' }}>
          <ErrorBoundary
            fallback={() => <div class={ui.previewError}>Failed</div>}
          >
            <AutoCanvas pixelRatio={1}>
              <FlamePreviewInner flame={displayFlame()} hovered={hovered()} />
            </AutoCanvas>
          </ErrorBoundary>
        </Root>
      </Show>
      <div class={ui.itemTitle}>
        <span class={ui.itemName}>{props.anim.name}</span>
        <span class={ui.itemMeta}>
          <span class={ui.itemDesc} title={props.anim.description}>
            {props.anim.description}
          </span>
          <span
            class={ui.animatedBadge}
            title={`${props.anim.tracks.length} animation tracks`}
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
            {props.anim.tracks.length}
          </span>
        </span>
      </div>
    </button>
  )
}

/** RecentFlameItem -- renders a recent flame, plays animation on hover when tracks exist. */
function RecentFlameItem(props: {
  recent: {
    id: string
    name: string
    flame: FlameDescriptor
    savedAt: number
    tracks?: TimelineTrack[]
  }
  index: number
  onSelect: (flame: FlameDescriptor, tracks?: TimelineTrack[]) => void
  onDelete: (e: MouseEvent | KeyboardEvent, id: string) => void
}) {
  const hasTracks = () =>
    !!(props.recent.tracks && props.recent.tracks.length > 0)
  const [hovered, setHovered] = createSignal(false)
  const [animFrame, setAnimFrame] = createSignal(0)
  let rafId: number | undefined
  let startTime = 0

  const [container, setContainer] = createSignal<HTMLElement>()
  const intersection = useIntersectionObserver(container)
  const isVisible = createMemo(() => intersection()?.isIntersecting ?? false)
  const allowed = useComputeGate(() => ({
    isVisible: isVisible(),
    renderStatus: 'done',
    isSelected: hovered(),
  }))

  function startAnimating() {
    startTime = performance.now()

    function tick() {
      const elapsed = performance.now() - startTime
      const f =
        Math.floor((elapsed / ANIM_LOOP_MS) * ANIM_TOTAL_FRAMES) %
        ANIM_TOTAL_FRAMES
      setAnimFrame(f)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
  }

  function stopAnimating() {
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId)
      rafId = undefined
    }
    setAnimFrame(0)
  }

  onCleanup(() => {
    if (rafId !== undefined) cancelAnimationFrame(rafId)
  })

  const displayFlame = (): FlameDescriptor => {
    if (!hovered() || !hasTracks()) return props.recent.flame
    const clone = deepClone(props.recent.flame)
    applyTracksToFlame(props.recent.tracks!, clone, animFrame())
    return clone
  }

  return (
    <button
      class={ui.item}
      onClick={() => {
        const clone = deepClone(props.recent.flame)
        props.onSelect(
          clone,
          props.recent.tracks ? deepClone(props.recent.tracks) : undefined,
        )
      }}
      onMouseEnter={() => {
        setHovered(true)
        if (hasTracks()) startAnimating()
      }}
      onMouseLeave={() => {
        setHovered(false)
        stopAnimating()
      }}
      ref={setContainer}
    >
      <Show when={allowed() || isVisible()}>
        <Show
          when={hasTracks()}
          fallback={<Preview flameDescriptor={props.recent.flame} />}
        >
          <Root adapterOptions={{ powerPreference: 'high-performance' }}>
            <AutoCanvas pixelRatio={1}>
              <FlamePreviewInner flame={displayFlame()} hovered={hovered()} />
            </AutoCanvas>
          </Root>
        </Show>
      </Show>
      <div class={ui.itemTitle}>
        <span class={ui.itemName}>{props.recent.name}</span>
        <span class={ui.itemMeta}>
          {(props.recent.flame.renderSettings.dimensions ?? 2) === 3 && (
            <span class={ui.dimBadge} title="3D flame">
              3D
            </span>
          )}
          {formatRecentDate(props.recent.savedAt)}
          {hasTracks() && (
            <span
              class={ui.animatedBadge}
              title={`${props.recent.tracks!.length} animation track${props.recent.tracks!.length !== 1 ? 's' : ''}`}
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
              {props.recent.tracks!.length}
            </span>
          )}
        </span>
      </div>
      <span
        class={ui.deleteBtn}
        role="button"
        tabIndex={0}
        style={{
          position: 'absolute',
          top: '0.25rem',
          right: '0.25rem',
          padding: 'var(--space-1)',
          'background-color': 'rgb(from var(--neutral-950) r g b / 60%)',
          border: 'none',
          'border-radius': 'var(--space-1)',
          cursor: 'pointer',
          color: 'white',
          'line-height': '0',
          width: '1.5rem',
          height: '1.5rem',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
        }}
        onClick={(e) => {
          props.onDelete(e, props.recent.id)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            props.onDelete(e, props.recent.id)
          }
        }}
        title="Delete"
      >
        <Cross />
      </span>
    </button>
  )
}

type LoadFlameModalProps = {
  respond: (payload: FlameDescriptor | AnimationLoad | typeof CANCEL) => void
  /** Workspace dimension when the modal opened — that dimension's examples
   *  are listed first. */
  currentDimensions?: number
}

type DimensionFilter = 'all' | '2d' | '3d'

function flameDimension(flame: FlameDescriptor): '2d' | '3d' {
  return (flame.renderSettings.dimensions ?? 2) === 3 ? '3d' : '2d'
}

function Icon2D() {
  return (
    <svg
      viewBox="0 0 14 14"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linejoin="round"
    >
      <rect x="2" y="2" width="10" height="10" rx="1" />
    </svg>
  )
}

function Icon3D() {
  return (
    <svg
      viewBox="0 0 14 14"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      stroke-width="1.2"
      stroke-linejoin="round"
    >
      <path d="M7 1.2 L12.4 4.1 L12.4 9.9 L7 12.8 L1.6 9.9 L1.6 4.1 Z" />
      <path d="M1.6 4.1 L7 7 L12.4 4.1" />
      <path d="M7 7 L7 12.8" />
    </svg>
  )
}

/** Gallery group with a collapsible header. Collapsed groups unmount their
 *  WebGPU previews, so collapsing also frees GPU work. */
function CollapsibleSection(props: {
  title: string
  count: number
  collapsed: boolean
  onToggle: () => void
  /** Flex order inside the sections wrapper — lets the current workspace
   *  dimension's group sort first without remounting DOM. */
  order: number
  children: JSX.Element
}) {
  return (
    <div style={{ order: String(props.order) }}>
      <h2 class={ui.sectionHeader} onClick={props.onToggle}>
        <span class={ui.chevron}>{props.collapsed ? '▶' : '▼'}</span>
        <span>{props.title}</span>
        <span class={ui.sectionCount}>{props.count}</span>
      </h2>
      <Show when={!props.collapsed}>
        <section class={ui.gallery}>{props.children}</section>
      </Show>
    </div>
  )
}

function ExampleItem(props: {
  exampleId: string
  example: FlameDescriptor
  index: number
  onSelect: (flame: FlameDescriptor) => void
}) {
  return (
    <button
      class={ui.item}
      onClick={() => {
        props.onSelect(props.example)
      }}
    >
      <DelayedShow delayMs={props.index * 50}>
        <Preview flameDescriptor={props.example} />
      </DelayedShow>
      <div class={ui.itemTitle}>
        <span class={ui.itemName}>
          {props.example.metadata?.name || props.exampleId}
        </span>
        <Show when={props.example.metadata?.description}>
          <span class={ui.itemMeta}>
            <span
              class={ui.itemDesc}
              title={props.example.metadata?.description}
            >
              {props.example.metadata?.description}
            </span>
          </span>
        </Show>
      </div>
    </button>
  )
}

async function pickPngFile(): Promise<File | null> {
  try {
    if ('showOpenFilePicker' in window) {
      const fileHandles = await window
        .showOpenFilePicker({
          id: 'load-flame-from-file',
          types: [{ accept: { 'image/png': ['.png'] } }],
        })
        .catch(() => undefined)
      if (!fileHandles) {
        return null
      }
      const [fileHandle] = fileHandles
      return await fileHandle.getFile()
    }
  } catch (_) {
    // fall through to input-based picker any failure
  }

  // fallback: hidden input element (works on Firefox and Safari/iOS)
  return await new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,.png'
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    input.style.width = '1px'
    input.style.height = '1px'
    input.addEventListener('change', () => {
      const file = input.files && input.files[0] ? input.files[0] : null
      resolve(file ?? null)
      input.remove()
    })
    input.addEventListener('cancel', () => {
      resolve(null)
      input.remove()
    })
    document.body.appendChild(input)
    input.click()
  })
}

export function LoadFlameModal(props: LoadFlameModalProps) {
  const [recentFlames, setRecentFlames] = createSignal(loadRecentFlames())
  const showAlert = useAlert()
  const [isDragging, setIsDragging] = createSignal(false)

  const [dimFilter, setDimFilter] = persistentSignal<DimensionFilter>(
    'load-flame-dimension-filter',
    'all',
  )
  const [collapsedSections, setCollapsedSections] = persistentSignal<
    Record<string, boolean>
  >('load-flame-collapsed-sections', {})
  const toggleSection = (key: string) => {
    setCollapsedSections((c) => ({ ...c, [key]: !c[key] }))
  }

  const show2D = () => dimFilter() !== '3d'
  const show3D = () => dimFilter() !== '2d'
  const filteredRecents = () =>
    recentFlames().filter(
      (r) => dimFilter() === 'all' || flameDimension(r.flame) === dimFilter(),
    )

  const allExamples = recordEntries(examples)
  const examples2D = allExamples.filter(([, e]) => flameDimension(e) === '2d')
  const examples3D = allExamples.filter(([, e]) => flameDimension(e) === '3d')
  const animations2D = animationDefs.filter(
    (a) => flameDimension(getAnimationFlame(a)) === '2d',
  )
  const animations3D = animationDefs.filter(
    (a) => flameDimension(getAnimationFlame(a)) === '3d',
  )
  const is3DWorkspace = (props.currentDimensions ?? 2) === 3

  async function processPngFile(file: File) {
    const arrBuf = new Uint8Array(await file.arrayBuffer())
    try {
      const result = await extractFlameFromPng(arrBuf)
      if (result.animation && result.animation.tracks.length > 0) {
        props.respond({
          flame: result.flame,
          tracks: result.animation.tracks,
        })
      } else {
        props.respond(result.flame)
      }
    } catch (err) {
      console.warn(err)

      void showAlert(`No valid flame found in '${file.name}'.`)
    }
  }

  async function loadFromFile() {
    const file = await pickPngFile()
    if (!file) return
    await processPngFile(file)
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault()
    setIsDragging(false)
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    await processPngFile(file)
  }

  const requestModal = useRequestModal()

  async function handleDeleteRecent(e: MouseEvent | KeyboardEvent, id: string) {
    e.stopPropagation()

    if (!dontAskDeleteRecent()) {
      const confirmed = await requestModal<boolean>({
        content: ({ respond }) => (
          <ConfirmDeleteRecentModal respond={respond} />
        ),
      })
      if (!confirmed) return
    }

    deleteRecentFlame(id)
    setRecentFlames(loadRecentFlames())
  }

  return (
    <>
      <ModalTitleBar
        onClose={() => {
          props.respond(CANCEL)
        }}
      >
        Discover Fractal Flames
      </ModalTitleBar>
      <p class={ui.modalSubtitle}>
        Select a preset to begin, load a recent creation, or import a saved PNG
        config.
      </p>
      <div
        class={ui.uploadZone}
        classList={{ [ui.uploadZoneDragging as string]: isDragging() }}
        onClick={loadFromFile}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <svg
          class={ui.uploadIcon}
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <div class={ui.uploadTitle}>
          {isDragging() ? 'Drop PNG Here!' : 'Import from PNG File'}
        </div>
        <div class={ui.uploadSubtitle}>
          {isDragging()
            ? 'Release to load the flame configuration.'
            : 'Click to choose a file, or drag and drop an exported PNG flame directly into the app or here to load it.'}
        </div>
      </div>
      <div class={ui.filterRow} role="group" aria-label="Filter by dimension">
        <button
          class={ui.filterPill}
          classList={{
            [ui.filterPillActive as string]: dimFilter() === 'all',
          }}
          onClick={() => setDimFilter('all')}
        >
          All
        </button>
        <button
          class={ui.filterPill}
          classList={{
            [ui.filterPillActive as string]: dimFilter() === '2d',
          }}
          onClick={() => setDimFilter('2d')}
        >
          <Icon2D />
          2D
        </button>
        <button
          class={ui.filterPill}
          classList={{
            [ui.filterPillActive as string]: dimFilter() === '3d',
          }}
          onClick={() => setDimFilter('3d')}
        >
          <Icon3D />
          3D
        </button>
      </div>
      <div class={ui.galleryScroll}>
        <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
          <div class={ui.sections}>
            <Show when={filteredRecents().length > 0}>
              <CollapsibleSection
                title="Recent Flames"
                count={filteredRecents().length}
                order={0}
                collapsed={!!collapsedSections().recent}
                onToggle={() => {
                  toggleSection('recent')
                }}
              >
                <For each={filteredRecents()}>
                  {(recent, i) => (
                    <RecentFlameItem
                      recent={recent}
                      index={i()}
                      onSelect={(flame, tracks) => {
                        if (tracks && tracks.length > 0) {
                          props.respond({ flame, tracks })
                        } else {
                          props.respond(flame)
                        }
                      }}
                      onDelete={async (e, id) => {
                        await handleDeleteRecent(e, id)
                      }}
                    />
                  )}
                </For>
              </CollapsibleSection>
            </Show>
            <Show when={show2D() && examples2D.length > 0}>
              <CollapsibleSection
                title="2D Examples"
                count={examples2D.length}
                order={is3DWorkspace ? 2 : 1}
                collapsed={!!collapsedSections().examples2d}
                onToggle={() => {
                  toggleSection('examples2d')
                }}
              >
                <For each={examples2D}>
                  {([exampleId, example], i) => (
                    <ExampleItem
                      exampleId={exampleId}
                      example={example}
                      index={i()}
                      onSelect={(flame) => {
                        props.respond(flame)
                      }}
                    />
                  )}
                </For>
              </CollapsibleSection>
            </Show>
            <Show when={show3D() && examples3D.length > 0}>
              <CollapsibleSection
                title="3D Examples"
                count={examples3D.length}
                order={is3DWorkspace ? 1 : 3}
                collapsed={!!collapsedSections().examples3d}
                onToggle={() => {
                  toggleSection('examples3d')
                }}
              >
                <For each={examples3D}>
                  {([exampleId, example], i) => (
                    <ExampleItem
                      exampleId={exampleId}
                      example={example}
                      index={i()}
                      onSelect={(flame) => {
                        props.respond(flame)
                      }}
                    />
                  )}
                </For>
              </CollapsibleSection>
            </Show>
            <Show when={show2D() && animations2D.length > 0}>
              <CollapsibleSection
                title="2D Animation Examples"
                count={animations2D.length}
                order={is3DWorkspace ? 4 : 2}
                collapsed={!!collapsedSections().animations2d}
                onToggle={() => {
                  toggleSection('animations2d')
                }}
              >
                <For each={animations2D}>
                  {(anim, i) => (
                    <AnimatedPreview
                      anim={anim}
                      index={i()}
                      onSelect={(flame, tracks) => {
                        props.respond({ flame, tracks })
                      }}
                    />
                  )}
                </For>
              </CollapsibleSection>
            </Show>
            <Show when={show3D() && animations3D.length > 0}>
              <CollapsibleSection
                title="3D Animation Examples"
                count={animations3D.length}
                order={is3DWorkspace ? 2 : 4}
                collapsed={!!collapsedSections().animations3d}
                onToggle={() => {
                  toggleSection('animations3d')
                }}
              >
                <For each={animations3D}>
                  {(anim, i) => (
                    <AnimatedPreview
                      anim={anim}
                      index={i()}
                      onSelect={(flame, tracks) => {
                        props.respond({ flame, tracks })
                      }}
                    />
                  )}
                </For>
              </CollapsibleSection>
            </Show>
          </div>
        </ComputeGate>
      </div>
    </>
  )
}

export function createLoadFlame(
  history: ChangeHistory<FlameDescriptor>,
  currentDimensions?: () => number,
) {
  const requestModal = useRequestModal()
  const [loadModalIsOpen, setLoadModalIsOpen] = createSignal(false)
  const [loadedAnimation, setLoadedAnimation] = createSignal<
    AnimationLoad | undefined
  >(undefined)

  async function showLoadFlameModal(): Promise<FlameDescriptor | undefined> {
    setLoadModalIsOpen(true)
    const result = await requestModal<
      FlameDescriptor | AnimationLoad | typeof CANCEL
    >({
      class: ui.loadFlameModal,
      content: ({ respond }) => (
        <LoadFlameModal
          respond={respond}
          currentDimensions={currentDimensions?.()}
        />
      ),
    })
    setLoadModalIsOpen(false)
    if (result === CANCEL) {
      return undefined
    }
    // Animation load: flame + keyframe tracks
    if (typeof result === 'object' && 'tracks' in result) {
      if (IS_DEV)
        console.info('[load] animation selected —', result.tracks.length)
      batch(() => {
        const flame = deepClone(result.flame)
        if (!flame.renderSettings.camera3D) {
          flame.renderSettings.camera3D = deepClone(camera3DDefault)
        }
        history.replace(flame)
        setLoadedAnimation({
          flame,
          tracks: result.tracks.map((t) => ({
            ...t,
            keyframes: t.keyframes.map((kf) => ({ ...kf })),
          })),
        })
      })
      return result.flame
    }
    // Plain flame load — clear any animation tracks
    if (IS_DEV)
      console.info(
        '[load] plain flame selected — batching flame + empty tracks',
      )
    batch(() => {
      const flame = deepClone(result)
      if (!flame.renderSettings.camera3D) {
        flame.renderSettings.camera3D = deepClone(camera3DDefault)
      }
      history.replace(flame)
      setLoadedAnimation({ flame, tracks: [] })
    })
    return result
  }

  return {
    showLoadFlameModal,
    loadModalIsOpen,
    loadedAnimation,
    setLoadedAnimation,
    clearLoadedAnimation: () => {
      setLoadedAnimation(undefined)
    },
  }
}
