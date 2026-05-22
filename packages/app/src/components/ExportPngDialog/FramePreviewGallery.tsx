import { createSignal, For, Show } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { DEFAULT_POINT_COUNT, DEFAULT_PREVIEW_PIXEL_RATIO } from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Root } from '@/lib/Root'
import { applyTimelineToFlameAtFrame } from '@/utils/timeline'
import ui from './FramePreviewGallery.module.css'
import type { Palette } from '@/flame/colorMap'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineConfig, TimelineTrack } from '@/utils/timeline'

type PreviewQuality = 'low' | 'mid' | 'high'

const QUALITY_CONFIG: Record<
  PreviewQuality,
  { quality: number; delayMs: number; maxFrames: number }
> = {
  low: { quality: 0.5, delayMs: 350, maxFrames: 30 },
  mid: { quality: 0.8, delayMs: 700, maxFrames: 30 },
  high: { quality: 0.95, delayMs: 1400, maxFrames: 30 },
}

type Props = {
  flameDescriptor: FlameDescriptor
  tracks: TimelineTrack[]
  config: TimelineConfig
  selectedPalette: () => Palette | undefined
}

export function FramePreviewGallery(props: Props) {
  const [thumbnails, setThumbnails] = createSignal<string[]>([])
  const [isGenerating, setIsGenerating] = createSignal(false)
  const [progress, setProgress] = createSignal<{
    current: number
    total: number
  }>()
  const [previewQuality, setPreviewQuality] =
    createSignal<PreviewQuality>('low')

  const totalFrames = props.config.endFrame - props.config.startFrame + 1
  const displayCount = () =>
    Math.min(totalFrames, QUALITY_CONFIG[previewQuality()].maxFrames)

  let captureCanvasRef: HTMLCanvasElement | undefined
  let aborted = false

  function flameForFrame(frameIdx: number): FlameDescriptor {
    const frame = props.config.startFrame + frameIdx
    const clone: FlameDescriptor = JSON.parse(
      JSON.stringify(props.flameDescriptor),
    )
    applyTimelineToFlameAtFrame(
      { tracks: () => props.tracks, config: () => props.config } as never,
      clone as never,
      frame,
    )
    return clone
  }

  async function generatePreviews() {
    aborted = false
    setIsGenerating(true)
    setThumbnails([])

    const cfg = QUALITY_CONFIG[previewQuality()]
    const results: string[] = []

    for (let i = 0; i < displayCount(); i++) {
      if (aborted) break

      setProgress({ current: i + 1, total: displayCount() })
      const desc = flameForFrame(i)
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
          if (elapsed >= cfg.delayMs) {
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
          const dataUrl = captureCanvasRef.toDataURL('image/jpeg', 0.7)
          results.push(dataUrl)
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

  const cfg = () => QUALITY_CONFIG[previewQuality()]

  return (
    <div class={ui.gallery}>
      <Show when={isGenerating()}>
        <div
          class={ui.hiddenRenderer}
          style="width:96px;height:72px;opacity:0;pointer-events:none"
        >
          <Root adapterOptions={{ powerPreference: 'high-performance' }}>
            <AutoCanvas pixelRatio={DEFAULT_PREVIEW_PIXEL_RATIO}>
              <Camera2D position={cameraPos()} zoom={cameraZoom()}>
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
                    />
                  )}
                </Show>
              </Camera2D>
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
            <button
              type="button"
              class={ui.generateButton}
              onClick={generatePreviews}
              title="Generate previews"
            >
              Render Previews
            </button>
          </Show>
        </div>
      </div>

      <Show
        when={thumbnails().length > 0}
        fallback={
          <div class={ui.emptyState}>
            {isGenerating()
              ? 'Preparing renderer...'
              : 'Generate frame thumbnails to preview the animation'}
          </div>
        }
      >
        <div class={ui.grid}>
          <For each={thumbnails()}>
            {(dataUrl, idx) => (
              <div class={ui.thumbnail}>
                <img
                  src={dataUrl}
                  alt={`Frame ${props.config.startFrame + idx()}`}
                />
                <span class={ui.frameNumber}>
                  {props.config.startFrame + idx()}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
