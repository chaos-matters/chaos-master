import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { ANIMATION_FRAME_PREVIEW_QUALITY_HIGH, ANIMATION_FRAME_PREVIEW_QUALITY_LOW, ANIMATION_FRAME_PREVIEW_QUALITY_MID, DEFAULT_POINT_COUNT, DEFAULT_PREVIEW_PIXEL_RATIO, } from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Default3DPreviewCamera } from '@/lib/Camera3D'
import { Root } from '@/lib/Root'
import { resolveAspectRatio } from '@/utils/exportDimensions'
import { applyTimelineToFlameAtFrame } from '@/utils/timeline'
import ui from './FramePreviewGallery.module.css'
import type { Palette } from '@/flame/colorMap'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ExportAspectKey } from '@/utils/exportDimensions'
import type { TimelineConfig, TimelineTrack } from '@/utils/timeline'

type PreviewQuality = 'low' | 'mid' | 'high'

const QUALITY_CONFIG: Record<
  PreviewQuality,
  {
    quality: number
    delayMs: number
    maxFrames: number
    /** Longest edge (px) of the preview render; the other edge follows aspect. */
    maxEdge: number
  }
> = {
  low: {
    quality: ANIMATION_FRAME_PREVIEW_QUALITY_LOW,
    delayMs: 600,
    maxFrames: 30,
    maxEdge: 200,
  },
  mid: {
    quality: ANIMATION_FRAME_PREVIEW_QUALITY_MID,
    delayMs: 1200,
    maxFrames: 30,
    maxEdge: 320,
  },
  high: {
    quality: ANIMATION_FRAME_PREVIEW_QUALITY_HIGH,
    delayMs: 2400,
    maxFrames: 30,
    maxEdge: 480,
  },
}

const THUMB_SIZE_MIN = 60
const THUMB_SIZE_MAX = 200
const THUMB_SIZE_DEFAULT = 90

// Longest on-screen edge of the hover popup. Kept modest so it's a faithful,
// correct-aspect preview of the export — not a giant near-4K overlay.
const HOVER_MAX_EDGE = 420

const HOVER_DEBOUNCE_MS = 300

/** Compute width/height for a longest-edge size at the given W/H aspect ratio. */
function dimsForAspect(
  ratio: number,
  longEdge: number,
): { width: number; height: number } {
  return ratio >= 1
    ? { width: Math.round(longEdge), height: Math.round(longEdge / ratio) }
    : { width: Math.round(longEdge * ratio), height: Math.round(longEdge) }
}

type Thumb = { src: string; frame: number }

type Props = {
  flameDescriptor: FlameDescriptor
  tracks: TimelineTrack[]
  config: TimelineConfig
  selectedPalette: () => Palette | undefined
  /** Export aspect chosen in the format card (so previews match the output). */
  aspect: ExportAspectKey
  /** Current viewport W/H aspect, used to resolve the "auto" aspect. */
  viewportAspect: number
  /** Notifies the parent when preview rendering starts/stops (to lock settings). */
  onGeneratingChange?: (generating: boolean) => void
}

export function FramePreviewGallery(props: Props) {
  const [thumbnails, setThumbnails] = createSignal<Thumb[]>([])
  const [isGenerating, setIsGenerating] = createSignal(false)
  const [progress, setProgress] = createSignal<{
    current: number
    total: number
  }>()
  const [previewQuality, setPreviewQuality] =
    createSignal<PreviewQuality>('low')
  // Render every Nth frame so long animations can be previewed across their
  // whole range quickly (1 = every frame, the default).
  const [previewStride, setPreviewStride] = createSignal(1)

  const totalFrames = props.config.endFrame - props.config.startFrame + 1
  // How many previews the current stride yields across the whole range.
  const totalPreviews = () => Math.ceil(totalFrames / previewStride())
  const displayCount = () =>
    Math.min(totalPreviews(), QUALITY_CONFIG[previewQuality()].maxFrames)

  // Preview aspect ratio (W/H) matching the chosen export aspect.
  const previewRatio = () =>
    resolveAspectRatio(props.aspect, props.viewportAspect)
  const cfg = () => QUALITY_CONFIG[previewQuality()]
  const canvasDims = () => dimsForAspect(previewRatio(), cfg().maxEdge)
  const hoverDims = () => dimsForAspect(previewRatio(), HOVER_MAX_EDGE)

  let captureCanvasRef: HTMLCanvasElement | undefined
  let aborted = false

  // Thumbnail cell size (controlled by slider, always visible)
  const [thumbSize, setThumbSize] = createSignal(THUMB_SIZE_DEFAULT)

  // Let the parent lock the export format settings while previews render.
  createEffect(() => {
    props.onGeneratingChange?.(isGenerating())
  })

  // Cached previews become stale when the aspect or stride changes — drop them
  // so they're re-rendered consistently (skip the very first run).
  let isFirstReset = true
  createEffect(() => {
    void previewRatio()
    void previewStride()
    if (isFirstReset) {
      isFirstReset = false
      return
    }
    setThumbnails([])
  })

  // Hover preview state (debounced)
  const [hoveredIndex, setHoveredIndex] = createSignal<number | null>(null)
  const [visibleHoverIndex, setVisibleHoverIndex] = createSignal<number | null>(
    null,
  )
  const [hoverPos, setHoverPos] = createSignal({ x: 0, y: 0 })
  let hoverTimer: ReturnType<typeof setTimeout> | undefined

  // Derived: hovered thumbnail
  const hoverThumb = createMemo(() => {
    const idx = visibleHoverIndex()
    if (idx === null) return undefined
    return thumbnails()[idx]
  })

  function flameForFrame(frameIdx: number): FlameDescriptor {
    const frame = props.config.startFrame + frameIdx
    const clone: FlameDescriptor = JSON.parse(
      JSON.stringify(props.flameDescriptor),
    )

    applyTimelineToFlameAtFrame(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { tracks: () => props.tracks, config: () => props.config } as any,
      clone,
      frame,
    )
    return clone
  }

  async function generatePreviews(append = false) {
    aborted = false
    setIsGenerating(true)

    const c = cfg()
    const stride = previewStride()
    const total = totalPreviews()
    // "Render more" continues from where the last batch stopped; a fresh render
    // starts at the first preview. Each batch covers up to maxFrames previews.
    const startK = append ? thumbnails().length : 0
    const endK = Math.min(startK + c.maxFrames, total)
    const results: Thumb[] = append ? [...thumbnails()] : []
    if (!append) setThumbnails([])
    const batchTotal = endK - startK

    for (let k = startK; k < endK; k++) {
      if (aborted) break

      const frameIdx = k * stride
      setProgress({ current: k - startK + 1, total: batchTotal })
      const desc = flameForFrame(frameIdx)
      setFrameDescriptor(() => desc)

      await new Promise<void>((resolve) => {
        // eslint-disable-next-line no-restricted-globals
        const start = performance.now()
        let resolved = false

        function tryResolve() {
          if (resolved) return
          if (aborted) {
            resolved = true
            resolve()
            return
          }
          // eslint-disable-next-line no-restricted-globals
          const elapsed = performance.now() - start
          if (elapsed >= c.delayMs) {
            resolved = true
            resolve()
            return
          }
          requestAnimationFrame(tryResolve)
        }
        requestAnimationFrame(tryResolve)
      })
      if (aborted) break

      if (captureCanvasRef) {
        try {
          const dataUrl = captureCanvasRef.toDataURL('image/jpeg', 0.85)
          results.push({
            src: dataUrl,
            frame: props.config.startFrame + frameIdx,
          })
          setThumbnails([...results])
        } catch {
          // Canvas may be tainted or unavailable
        }
      }
    }

    setProgress(undefined)
    setIsGenerating(false)
  }

  function stopGeneration() {
    aborted = true
    setIsGenerating(false)
    setProgress(undefined)
  }

  function clearThumbnails() {
    setThumbnails([])
  }

  const [frameDescriptor, setFrameDescriptor] = createSignal<FlameDescriptor>(
    flameForFrame(0),
  )

  const cameraPos = () => {
    const p = frameDescriptor().renderSettings.camera.position
    return vec2f(p[0], p[1])
  }

  const cameraZoom = () => frameDescriptor().renderSettings.camera.zoom

  // Hover handlers for thumbnails (debounced, viewport-fixed)
  function onThumbEnter(idx: number, e: MouseEvent) {
    setHoveredIndex(idx)
    updateHoverPos(e)
    clearTimeout(hoverTimer)
    hoverTimer = setTimeout(() => {
      if (hoveredIndex() === idx) {
        setVisibleHoverIndex(idx)
      }
    }, HOVER_DEBOUNCE_MS)
  }

  function onThumbMove(e: MouseEvent) {
    updateHoverPos(e)
  }

  function onThumbLeave() {
    clearTimeout(hoverTimer)
    setHoveredIndex(null)
    setVisibleHoverIndex(null)
  }

  function updateHoverPos(e: MouseEvent) {
    // Use viewport coordinates for fixed positioning
    const { width: previewW, height: previewH } = hoverDims()
    let x = e.clientX + 16
    let y = e.clientY - previewH / 2

    // Clamp so it stays within the viewport
    if (x + previewW > window.innerWidth) {
      x = e.clientX - previewW - 16
    }
    if (y < 8) y = 8
    if (y + previewH > window.innerHeight - 8) {
      y = window.innerHeight - previewH - 8
    }
    setHoverPos({ x, y })
  }

  return (
    <div class={ui.gallery}>
      <Show when={isGenerating()}>
        <div
          class={ui.hiddenRenderer}
          style={{
            width: `${canvasDims().width}px`,
            height: `${canvasDims().height}px`,
            opacity: '0',
            'pointer-events': 'none',
          }}
        >
          <Root adapterOptions={{ powerPreference: 'high-performance' }}>
            <AutoCanvas pixelRatio={DEFAULT_PREVIEW_PIXEL_RATIO}>
              {(() => {
                const flameView = () => (
                  <Show when={frameDescriptor()} keyed>
                    {(desc) => (
                      <Flam3
                        quality={cfg().quality}
                        pointCountPerBatch={DEFAULT_POINT_COUNT}
                        adaptiveFilterEnabled={false}
                        animationEnabled={false}
                        flameDescriptor={desc}
                        renderInterval={0}
                        edgeFadeColor={vec4f(0)}
                        onExportImage={(canvas) => {
                          captureCanvasRef = canvas
                        }}
                        palette={props.selectedPalette}
                        onAccumulatedPointCount={() => {}}
                      />
                    )}
                  </Show>
                )
                return (
                  <Show
                    when={
                      (frameDescriptor()?.renderSettings.dimensions ?? 2) === 3
                    }
                    fallback={
                      <Camera2D position={cameraPos()} zoom={cameraZoom()}>
                        {flameView()}
                      </Camera2D>
                    }
                  >
                    <Default3DPreviewCamera>
                      {flameView()}
                    </Default3DPreviewCamera>
                  </Show>
                )
              })()}
            </AutoCanvas>
          </Root>
        </div>
      </Show>

      <div class={ui.toolbar}>
        <div class={ui.qualityToggle}>
          {(['low', 'mid', 'high'] as PreviewQuality[]).map((q) => (
            <button
              type="button"
              class={ui.qualityButton}
              classList={{
                [ui.qualityActive as string]: previewQuality() === q,
              }}
              disabled={isGenerating()}
              onClick={() => setPreviewQuality(q)}
            >
              {q.charAt(0).toUpperCase() + q.slice(1)}
            </button>
          ))}
        </div>
        <label
          class={ui.strideControl}
          title="Preview every Nth frame, spread across the timeline (faster overview of long animations)"
        >
          <span class={ui.strideLabel}>Every</span>
          <input
            type="number"
            class={ui.strideInput}
            min="1"
            max={totalFrames}
            value={previewStride()}
            disabled={isGenerating()}
            onInput={(e) => {
              const n = Math.floor(e.currentTarget.valueAsNumber)
              setPreviewStride(Number.isFinite(n) && n >= 1 ? n : 1)
            }}
          />
          <span class={ui.strideLabel}>frame</span>
        </label>
        <div class={ui.actions}>
          <Show when={isGenerating()}>
            <div class={ui.progressLabel}>
              {progress()?.current ?? 0}/{progress()?.total ?? displayCount()}
            </div>
            <button
              type="button"
              class={ui.stopButton}
              onClick={stopGeneration}
              title="Stop generating"
            >
              Stop
            </button>
          </Show>
          <Show when={!isGenerating()}>
            <Show when={thumbnails().length > 0}>
              <button
                type="button"
                class={ui.clearButton}
                onClick={clearThumbnails}
                title="Clear thumbnails"
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  width="14"
                  height="14"
                >
                  <path d="M5 2V1h6v1h4v2h-1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4H1V2h4zm1 0h4v-.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V2zM4 4v9h8V4H4zm2 1h1v7H6V5zm3 0h1v7H9V5z" />
                </svg>
              </button>
            </Show>
            <Show
              when={
                thumbnails().length > 0 && thumbnails().length < totalPreviews()
              }
            >
              <button
                type="button"
                class={ui.generateButton}
                onClick={() => generatePreviews(true)}
                title="Render the next batch of frame previews"
              >
                Render more ({thumbnails().length}/{totalPreviews()})
              </button>
            </Show>
            <button
              type="button"
              class={ui.generateButton}
              onClick={() => generatePreviews(false)}
              title="Generate previews"
            >
              {thumbnails().length > 0 ? 'Re-render' : 'Render Previews'}
            </button>
          </Show>
        </div>
      </div>

      {/* Thumbnail size slider -- always visible */}
      <div class={ui.sizeSliderRow}>
        <svg class={ui.sizeIcon} viewBox="0 0 16 16" fill="currentColor">
          <rect x="5" y="5" width="6" height="6" rx="1" />
        </svg>
        <input
          type="range"
          class={ui.sizeSlider}
          min={THUMB_SIZE_MIN}
          max={THUMB_SIZE_MAX}
          value={thumbSize()}
          onInput={(e) => setThumbSize(e.currentTarget.valueAsNumber)}
          title={`Thumbnail size: ${thumbSize()}px`}
        />
        <svg class={ui.sizeIcon} viewBox="0 0 16 16" fill="currentColor">
          <rect x="3" y="3" width="10" height="10" rx="1.5" />
        </svg>
      </div>

      {/* Grid that fills available space */}
      <div class={ui.gridWrapper}>
        <Show
          when={thumbnails().length > 0}
          fallback={
            <div class={ui.emptyState}>
              Click "Render Previews" to generate frame thumbnails
            </div>
          }
        >
          <div
            class={ui.grid}
            style={{
              'grid-template-columns': `repeat(auto-fill, ${thumbSize()}px)`,
            }}
          >
            <For each={thumbnails()}>
              {(thumb, idx) => (
                <div
                  class={ui.thumbnail}
                  style={{ 'aspect-ratio': String(previewRatio()) }}
                  onMouseEnter={(e) => {
                    onThumbEnter(idx(), e)
                  }}
                  onMouseMove={onThumbMove}
                  onMouseLeave={onThumbLeave}
                >
                  <img src={thumb.src} alt={`Frame ${thumb.frame}`} />
                  <span class={ui.frameNumber}>{thumb.frame}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* Hover preview overlay -- position:fixed escapes overflow:hidden parents */}
      <Show when={hoverThumb()}>
        {(thumb) => {
          const pos = () => hoverPos()
          return (
            <div
              class={ui.hoverOverlay}
              style={{
                left: `${pos().x}px`,
                top: `${pos().y}px`,
                width: `${hoverDims().width}px`,
                height: `${hoverDims().height}px`,
              }}
            >
              <img src={thumb().src} alt={`Frame ${thumb().frame} preview`} />
              <span class={ui.hoverFrameLabel}>Frame {thumb().frame}</span>
            </div>
          )
        }}
      </Show>
    </div>
  )
}
