import { createSignal, Show } from 'solid-js'
import { createStore } from 'solid-js/store'
import { vec2f, vec3f, vec4f } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import { ScrubInput } from '@/components/Sliders/ScrubInput'
import { Slider } from '@/components/Sliders/Slider'
import { ALLOW_CAMERA_DURING_EXPORT, DEFAULT_POINT_COUNT, DEFAULT_PREVIEW_PIXEL_RATIO, } from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import { accumulatedPointCount, forceExportNow, qualityPointCountLimit, setCameraDuringExportEnabled, setExportProgress, setExportQuality, setForceExportNow, } from '@/flame/renderStats'
import { condenseFlameDescriptor, MAX_CAMERA_ZOOM_VALUE, MIN_CAMERA_ZOOM_VALUE, } from '@/flame/schema/flameSchema'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Root } from '@/lib/Root'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { deepClone } from '@/utils/clone'
import { addFlameDataToPng } from '@/utils/flameInPng'
import { compressJsonQueryParam } from '@/utils/jsonQueryParam'
import { persistentSignal } from '@/utils/persistentSignal'
import { saveRecentFlame } from '@/utils/recentFlames'
import { applyTimelineToFlameAtFrame, defaultConfig as defaultTimelineConfig, } from '@/utils/timeline'
import { Button } from '../Button/Button'
import { Checkbox } from '../Checkbox/Checkbox'
import { ColorPicker } from '../ColorPicker/ColorPicker'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import { defaultPills, getNearestPresetKey, QualityPresets, qualityPresets, } from '../Quality/QualityPresets'
import ui from './ExportPngDialog.module.css'
import { FramePreviewGallery } from './FramePreviewGallery'
import type { Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { ExportImageType } from '@/App'
import type { Palette } from '@/flame/colorMap'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { AnimationExportConfig } from '@/utils/animationExport'
import type { TimelineConfig, TimelineState, TimelineTrack, } from '@/utils/timeline'
import type { VideoEncoderConfig } from '@/utils/videoEncoder'

const QUALITY_MIN = 0.5
const QUALITY_MAX = 0.9999

/**
 * Estimate total points for final export at the given quality and resolution.
 * pointLimit = bucketInv / (q - 1)² where bucketInv = (height² * zoom²) / 4
 */
function estimatePointCount(
  quality: number,
  resolution: number,
  zoom: number,
): number {
  const baseHeight = 800 * resolution
  const bucketInv = (baseHeight ** 2 * zoom ** 2) / 4
  const denom = (quality - 1) ** 2
  if (denom === 0) return Infinity
  return Math.round(bucketInv / denom)
}

type RenderDialogProps = {
  resolution: number
  quality: number
  embedFlame: boolean
  embedAnimation: boolean
  condenseHidden: boolean
  hasAnimation: boolean
  tracks: TimelineTrack[]
  config: TimelineConfig
  previewDescriptor: FlameDescriptor
  setPreviewDescriptor: (...args: unknown[]) => void
  selectedPalette: () => Palette | undefined
  onResolutionChange: (v: number) => void
  onQualityChange: (v: number) => void
  onEmbedFlameChange: (v: boolean) => void
  onEmbedAnimationChange: (v: boolean) => void
  onCondenseHiddenChange: (v: boolean) => void
  onCancel: () => void
  onExport: () => void
  exportTab: 'image' | 'animation'
  onExportTabChange: (tab: 'image' | 'animation') => void
  animationQuality: number
  onAnimationQualityChange: (v: number) => void
  frameStart: number
  onFrameStartChange: (v: number) => void
  frameEnd: number
  onFrameEndChange: (v: number) => void
  animFps: number
  onAnimFpsChange: (v: number) => void
  playCount: number
  onPlayCountChange: (v: number) => void
  codec: VideoEncoderConfig['codec']
  onCodecChange: (v: VideoEncoderConfig['codec']) => void
  embedMetadata: boolean
  onEmbedMetadataChange: (v: boolean) => void
  cameraDuringExport: boolean
  onCameraDuringExportChange: (v: boolean) => void
  onRenderAnimation: () => void
}

function RenderDialog(props: RenderDialogProps) {
  const [renderMode, setRenderMode] = createSignal<'auto' | 'manual'>('auto')
  const [renderKey, setRenderKey] = createSignal(0)
  const [previewPoints, setPreviewPoints] = createSignal(0)
  const [previewLimitFn, setPreviewLimitFn] = createSignal<() => number>(
    () => 0,
  )

  const cameraPos = () =>
    vec2f(
      props.previewDescriptor.renderSettings.camera.position[0],
      props.previewDescriptor.renderSettings.camera.position[1],
    )

  const setFlameZoom: Setter<number> = (value) => {
    if (typeof value === 'function') {
      const currentZoom = props.previewDescriptor.renderSettings.camera.zoom
      const newZoom = clamp(
        value(currentZoom),
        MIN_CAMERA_ZOOM_VALUE,
        MAX_CAMERA_ZOOM_VALUE,
      )
      props.setPreviewDescriptor('renderSettings', 'camera', 'zoom', newZoom)
      return newZoom
    }
    const clampedZoom = clamp(
      value,
      MIN_CAMERA_ZOOM_VALUE,
      MAX_CAMERA_ZOOM_VALUE,
    )
    props.setPreviewDescriptor('renderSettings', 'camera', 'zoom', clampedZoom)
    return clampedZoom
  }

  const setFlamePosition: Setter<v2f> = (value) => {
    if (typeof value === 'function') {
      const [px, py] = props.previewDescriptor.renderSettings.camera.position
      const currentPos = vec2f(px, py)
      const newPos = value(currentPos)
      props.setPreviewDescriptor('renderSettings', 'camera', 'position', [
        newPos.x,
        newPos.y,
      ])
      return newPos
    }
    props.setPreviewDescriptor('renderSettings', 'camera', 'position', [
      value.x,
      value.y,
    ])
    return value
  }

  return (
    <>
      <ModalTitleBar onClose={props.onCancel}>Render Flame</ModalTitleBar>
      <div class={ui.tabBar}>
        <button
          type="button"
          class={ui.tab}
          classList={{ [ui.tabActive as string]: props.exportTab === 'image' }}
          onClick={() => {
            props.onExportTabChange('image')
          }}
        >
          Image
        </button>
        <button
          type="button"
          class={ui.tab}
          classList={{
            [ui.tabActive as string]: props.exportTab === 'animation',
            [ui.disabled as string]: !props.hasAnimation,
          }}
          disabled={!props.hasAnimation}
          onClick={() => {
            if (props.hasAnimation) props.onExportTabChange('animation')
          }}
          title={
            !props.hasAnimation
              ? 'Add keyframes to the timeline to enable animation export'
              : undefined
          }
        >
          Animation
        </button>
      </div>
      <Show when={props.exportTab === 'image'}>
        <div class={ui.dialogBody}>
          <div class={ui.previewPane}>
            <div class={ui.previewToolbar}>
              <button
                type="button"
                class={ui.renderModeToggle}
                classList={{
                  [ui.renderModeActive as string]: renderMode() === 'manual',
                }}
                onClick={() =>
                  setRenderMode((m) => (m === 'auto' ? 'manual' : 'auto'))
                }
                title={
                  renderMode() === 'auto'
                    ? 'Switch to manual render'
                    : 'Switch to auto render'
                }
              >
                {renderMode() === 'auto' ? 'Auto' : 'Manual'}
              </button>
              <Show when={renderMode() === 'manual'}>
                <button
                  type="button"
                  class={ui.renderPreviewButton}
                  onClick={() => setRenderKey((k) => k + 1)}
                >
                  Render Preview
                </button>
              </Show>
            </div>
            <Root adapterOptions={{ powerPreference: 'high-performance' }}>
              <AutoCanvas pixelRatio={DEFAULT_PREVIEW_PIXEL_RATIO}>
                <WheelZoomCamera2D
                  zoom={[
                    () => props.previewDescriptor.renderSettings.camera.zoom,
                    setFlameZoom,
                  ]}
                  position={[cameraPos, setFlamePosition]}
                >
                  <Show
                    when={
                      renderMode() === 'auto'
                        ? true
                        : renderKey() > 0
                          ? renderKey()
                          : false
                    }
                    keyed
                  >
                    <Flam3
                      quality={props.quality}
                      pointCountPerBatch={DEFAULT_POINT_COUNT}
                      adaptiveFilterEnabled={false}
                      animationEnabled={false}
                      flameDescriptor={props.previewDescriptor}
                      renderInterval={renderMode() === 'auto' ? 1 : 0}
                      edgeFadeColor={vec4f(0)}
                      palette={props.selectedPalette}
                      onAccumulatedPointCount={setPreviewPoints}
                      setQualityPointCountLimit={(fn) =>
                        setPreviewLimitFn(() => fn)
                      }
                    />
                  </Show>
                </WheelZoomCamera2D>
              </AutoCanvas>
            </Root>
          </div>
          <div class={ui.controlsPane}>
            <label class={ui.field}>
              <span>Resolution</span>
              <select
                class={ui.select}
                value={props.resolution}
                onChange={(e) => {
                  props.onResolutionChange(Number(e.currentTarget.value))
                }}
              >
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>
            </label>

            <fieldset class={ui.field}>
              <span>Quality</span>
              <QualityPresets
                pills={defaultPills}
                selectedKey={getNearestPresetKey(props.quality)}
                onSelect={(key) => {
                  props.onQualityChange(
                    qualityPresets[key as keyof typeof qualityPresets],
                  )
                }}
                allPillsFill={true}
                currentPoints={previewPoints()}
                targetPoints={previewLimitFn()()}
              />
              <ScrubInput
                label="Quality"
                value={props.quality * 100}
                min={QUALITY_MIN * 100}
                max={QUALITY_MAX * 100}
                step={0.1}
                formatValue={(v) => `${v.toFixed(1)}%`}
                onInput={(v) => {
                  props.onQualityChange(v / 100)
                }}
              />
            </fieldset>

            <div class={ui.sliderField}>
              <Slider
                label="Exposure"
                value={props.previewDescriptor.renderSettings.exposure}
                min={-4}
                max={4}
                step={0.001}
                onInput={(v) => {
                  props.setPreviewDescriptor('renderSettings', 'exposure', v)
                }}
              />
            </div>

            <div class={ui.sliderField}>
              <Slider
                label="Vibrancy"
                value={props.previewDescriptor.renderSettings.vibrancy}
                min={0}
                max={1}
                step={0.05}
                onInput={(v) => {
                  props.setPreviewDescriptor('renderSettings', 'vibrancy', v)
                }}
              />
            </div>

            <div class={ui.sliderField}>
              <Slider
                label="Contrast"
                value={props.previewDescriptor.renderSettings.contrast}
                min={0.1}
                max={10}
                step={0.01}
                onInput={(v) => {
                  props.setPreviewDescriptor('renderSettings', 'contrast', v)
                }}
              />
            </div>

            <div class={ui.sliderField}>
              <Slider
                label="Gamma"
                value={props.previewDescriptor.renderSettings.gamma}
                min={0.2}
                max={5}
                step={0.01}
                onInput={(v) => {
                  props.setPreviewDescriptor('renderSettings', 'gamma', v)
                }}
              />
            </div>

            <label class={ui.field}>
              <span>Draw Mode</span>
              <select
                class={ui.select}
                value={props.previewDescriptor.renderSettings.drawMode}
                onChange={(e) => {
                  props.setPreviewDescriptor(
                    'renderSettings',
                    'drawMode',
                    e.currentTarget.value,
                  )
                }}
              >
                <option value="light">Light</option>
                <option value="paint">Paint</option>
              </select>
            </label>

            <label class={ui.field}>
              <span>Background</span>
              <div class={ui.bgColorRow}>
                <ColorPicker
                  value={(() => {
                    const bg =
                      props.previewDescriptor.renderSettings.backgroundColor
                    return bg ? vec3f(bg[0], bg[1], bg[2]) : undefined
                  })()}
                  setValue={(newBgColor) => {
                    props.setPreviewDescriptor(
                      'renderSettings',
                      'backgroundColor',
                      [newBgColor.x, newBgColor.y, newBgColor.z] as [
                        number,
                        number,
                        number,
                      ],
                    )
                  }}
                />
                {props.previewDescriptor.renderSettings.backgroundColor !==
                  undefined && (
                  <Button
                    onClick={() => {
                      props.setPreviewDescriptor(
                        'renderSettings',
                        'backgroundColor',
                        undefined,
                      )
                    }}
                  >
                    Auto
                  </Button>
                )}
              </div>
            </label>

            <label class={ui.checkboxField}>
              <Checkbox
                checked={props.embedFlame}
                onChange={(checked) => {
                  props.onEmbedFlameChange(checked)
                }}
              />
              <span>Embed flame data</span>
            </label>

            <label
              class={ui.checkboxField}
              classList={{ [ui.disabled as string]: !props.hasAnimation }}
            >
              <Checkbox
                checked={props.embedAnimation && props.hasAnimation}
                onChange={(checked) => {
                  props.onEmbedAnimationChange(checked)
                }}
              />
              <span>Embed animation</span>
            </label>

            <label class={ui.checkboxField}>
              <Checkbox
                checked={props.condenseHidden}
                onChange={(checked) => {
                  props.onCondenseHiddenChange(checked)
                }}
              />
              <span>Remove hidden elements</span>
            </label>
          </div>
        </div>
      </Show>

      <Show when={props.exportTab === 'animation'}>
        <div class={ui.dialogBody}>
          <div class={ui.animationPreviewPane}>
            <FramePreviewGallery
              flameDescriptor={props.previewDescriptor}
              tracks={props.tracks}
              config={props.config}
              selectedPalette={props.selectedPalette}
            />
          </div>
          <div class={ui.controlsPane}>
            <label class={ui.field}>
              <span>Resolution</span>
              <select
                class={ui.select}
                value={props.resolution}
                onChange={(e) => {
                  props.onResolutionChange(Number(e.currentTarget.value))
                }}
              >
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>
            </label>

            <fieldset class={ui.field}>
              <span>Quality</span>
              <QualityPresets
                pills={defaultPills}
                selectedKey={getNearestPresetKey(props.animationQuality)}
                onSelect={(key) => {
                  props.onAnimationQualityChange(
                    qualityPresets[key as keyof typeof qualityPresets],
                  )
                }}
                allPillsFill={true}
                currentPoints={previewPoints()}
                targetPoints={previewLimitFn()()}
              />
              <ScrubInput
                label="Quality"
                value={props.animationQuality * 100}
                min={QUALITY_MIN * 100}
                max={QUALITY_MAX * 100}
                step={0.1}
                formatValue={(v) => `${v.toFixed(1)}%`}
                onInput={(v) => {
                  props.onAnimationQualityChange(v / 100)
                }}
              />
            </fieldset>

            <div class={ui.fieldRow}>
              <label class={ui.field}>
                <span>Start Frame</span>
                <input
                  type="number"
                  class={ui.numberInput}
                  value={props.frameStart}
                  onChange={(e) => {
                    const v = Number(e.currentTarget.value)
                    if (v < props.frameEnd) props.onFrameStartChange(v)
                  }}
                />
              </label>
              <label class={ui.field}>
                <span>End Frame</span>
                <input
                  type="number"
                  class={ui.numberInput}
                  value={props.frameEnd}
                  onChange={(e) => {
                    const v = Number(e.currentTarget.value)
                    if (v > props.frameStart) props.onFrameEndChange(v)
                  }}
                />
              </label>
            </div>

            <div class={ui.fieldRow}>
              <label class={ui.field}>
                <span>FPS</span>
                <input
                  type="number"
                  class={ui.numberInput}
                  min={12}
                  max={60}
                  value={props.animFps}
                  onChange={(e) => {
                    props.onAnimFpsChange(Number(e.currentTarget.value))
                  }}
                />
              </label>
              <label class={ui.field}>
                <span>Play Count</span>
                <input
                  type="number"
                  class={ui.numberInput}
                  min={1}
                  value={props.playCount}
                  onChange={(e) => {
                    props.onPlayCountChange(Number(e.currentTarget.value))
                  }}
                />
              </label>
            </div>

            <label class={ui.field}>
              <span>Codec</span>
              <select
                class={ui.select}
                value={props.codec}
                onChange={(e) => {
                  props.onCodecChange(
                    e.currentTarget.value as VideoEncoderConfig['codec'],
                  )
                }}
              >
                <option value="avc">H.264 (AVC)</option>
                <option value="hevc">H.265 (HEVC)</option>
                <option value="vp9">VP9</option>
              </select>
            </label>

            <label class={ui.checkboxField}>
              <Checkbox
                checked={props.embedMetadata}
                onChange={(checked) => {
                  props.onEmbedMetadataChange(checked)
                }}
              />
              <span>Embed metadata</span>
            </label>

            <label
              class={ui.checkboxField}
              title="Keep camera pan/scroll/zoom active while rendering — your live camera moves get baked into the video. Leave off for a deterministic export."
            >
              <Checkbox
                checked={props.cameraDuringExport}
                onChange={(checked) => {
                  props.onCameraDuringExportChange(checked)
                }}
              />
              <span>Camera control during render (experimental)</span>
            </label>
          </div>
        </div>
      </Show>

      <footer class={ui.footer}>
        <Button onClick={props.onCancel}>Cancel</Button>
        <Show when={props.exportTab === 'image'}>
          <Button onClick={props.onExport}>Export Image</Button>
        </Show>
        <Show when={props.exportTab === 'animation'}>
          <Button
            onClick={props.onRenderAnimation}
            disabled={!props.hasAnimation}
          >
            Render Animation
          </Button>
        </Show>
      </footer>
    </>
  )
}

export function createExportPngDialog(
  flameDescriptor: FlameDescriptor,
  getTimeline: () => TimelineState | undefined,
  getPixelRatio: () => number,
  setPixelRatio: Setter<number>,
  setOnExportImage: Setter<ExportImageType | undefined>,
  setFlameDescriptor: (updater: (draft: FlameDescriptor) => void) => void,
  selectedPalette: () => Palette | undefined,
  startAnimationExport?: (
    config: AnimationExportConfig,
    canvas: HTMLCanvasElement,
  ) => void,
) {
  const requestModal = useRequestModal()
  const [exportModalIsOpen, setExportModalIsOpen] = createSignal(false)

  function quickExport() {
    const timeline = getTimeline()
    const tracks = timeline?.tracks() ?? []
    const config = timeline?.config() ?? defaultTimelineConfig()
    const hasAnimation = tracks.some((track) => track.keyframes.length > 0)
    const currentRatio = getPixelRatio()

    setPixelRatio(currentRatio)
    setOnExportImage(() => (canvas: HTMLCanvasElement) => {
      setOnExportImage(undefined)
      setPixelRatio(currentRatio)
      canvas.toBlob(
        async (blob) => {
          if (!blob) return
          const imgData = await blob.arrayBuffer()
          let pngBytes = new Uint8Array(imgData)
          const currentTracks = timeline?.tracks() ?? []
          const payload = hasAnimation
            ? {
                flame: flameDescriptor,
                animation: { tracks: currentTracks, config },
              }
            : flameDescriptor
          const encoded = await compressJsonQueryParam(payload)
          pngBytes = new Uint8Array(
            await addFlameDataToPng(encoded, pngBytes).arrayBuffer(),
          )
          saveRecentFlame(flameDescriptor, undefined, currentTracks)
          const fileUrlExt = URL.createObjectURL(
            new Blob([pngBytes], { type: 'image/png' }),
          )
          const downloadLink = window.document.createElement('a')
          downloadLink.href = fileUrlExt
          downloadLink.download = 'flame.png'
          downloadLink.click()
        },
        'image/png',
        1,
      )
    })
  }

  async function showExportPngDialog() {
    const timeline = getTimeline()
    const tracks = timeline?.tracks() ?? []
    const config = timeline?.config() ?? defaultTimelineConfig()
    const hasAnimation = tracks.some((track) => track.keyframes.length > 0)
    const currentFrame = timeline?.currentFrame() ?? 0
    const currentRatio = getPixelRatio()

    const [resolution, setResolution] = persistentSignal(
      'export/resolution',
      currentRatio,
    )
    const [quality, setQuality] = persistentSignal('export/quality', 0.9)
    const [embedFlame, setEmbedFlame] = persistentSignal(
      'export/embed-flame',
      true,
    )
    const [embedAnimation, setEmbedAnimation] = persistentSignal(
      'export/embed-animation',
      hasAnimation,
    )
    const [condenseHidden, setCondenseHidden] = persistentSignal(
      'export/condense-hidden',
      false,
    )
    const [exportTab, setExportTab] = persistentSignal<'image' | 'animation'>(
      'export/tab',
      'image',
    )

    // Force back to image tab if no keyframes exist
    if (!hasAnimation && exportTab() === 'animation') {
      setExportTab('image')
    }

    // Animation tab state
    const [animationQuality, setAnimationQuality] = persistentSignal(
      'export/animation-quality',
      0.9,
    )
    // Default frame end to the last keyframe across all tracks,
    // so we only render up to the last meaningful change.
    const lastKeyframeFrame = tracks.reduce(
      (max, track) =>
        track.keyframes.reduce((m, kf) => Math.max(m, kf.frame), max),
      0,
    )
    // Compute frame range from the current animation's actual tracks every time
    // the dialog opens, rather than persisting stale values across sessions.
    const [frameStart, setFrameStart] = createSignal(config.startFrame)
    const [frameEnd, setFrameEnd] = createSignal(
      lastKeyframeFrame > 0 ? lastKeyframeFrame : config.endFrame,
    )
    const [animFps, setAnimFps] = persistentSignal(
      'export/anim-fps',
      config.fps,
    )
    const [playCount, setPlayCount] = persistentSignal('export/play-count', 1)
    const [codec, setCodec] = persistentSignal<VideoEncoderConfig['codec']>(
      'export/codec',
      'avc',
    )
    const [embedMetadata, setEmbedMetadata] = persistentSignal(
      'export/embed-metadata',
      true,
    )
    const [cameraDuringExport, setCameraDuringExport] = persistentSignal(
      'export/camera-during-export',
      ALLOW_CAMERA_DURING_EXPORT,
    )

    const initialFlame = deepClone(flameDescriptor)
    if (timeline && hasAnimation) {
      applyTimelineToFlameAtFrame(timeline, initialFlame, currentFrame)
    }

    const [previewDescriptor, setPreviewDescriptor] = createStore(initialFlame)

    function handleExport() {
      const res = resolution()
      const qual = quality()
      const doEmbedFlame = embedFlame()
      const doEmbedAnimation = embedAnimation()

      // Snapshot original render settings so we can restore them after export.
      // The dialog preview is independent of the main flame; users expect the
      // export settings to apply only to the exported image, not to persist in
      // the workspace.
      const originalSettings = {
        exposure: flameDescriptor.renderSettings.exposure,
        vibrancy: flameDescriptor.renderSettings.vibrancy,
        contrast: flameDescriptor.renderSettings.contrast,
        gamma: flameDescriptor.renderSettings.gamma,
        drawMode: flameDescriptor.renderSettings.drawMode,
        backgroundColor: flameDescriptor.renderSettings.backgroundColor,
        camera: {
          zoom: flameDescriptor.renderSettings.camera.zoom,
          position: [
            flameDescriptor.renderSettings.camera.position[0],
            flameDescriptor.renderSettings.camera.position[1],
          ] as [number, number],
        },
      }

      // Apply dialog render settings to main flame descriptor
      setFlameDescriptor((draft) => {
        draft.renderSettings.exposure =
          previewDescriptor.renderSettings.exposure
        draft.renderSettings.vibrancy =
          previewDescriptor.renderSettings.vibrancy
        draft.renderSettings.contrast =
          previewDescriptor.renderSettings.contrast
        draft.renderSettings.gamma = previewDescriptor.renderSettings.gamma
        draft.renderSettings.drawMode =
          previewDescriptor.renderSettings.drawMode
        draft.renderSettings.backgroundColor =
          previewDescriptor.renderSettings.backgroundColor
        draft.renderSettings.camera.zoom =
          previewDescriptor.renderSettings.camera.zoom
        draft.renderSettings.camera.position = [
          previewDescriptor.renderSettings.camera.position[0],
          previewDescriptor.renderSettings.camera.position[1],
        ]
      })

      // Estimate target points and show progress
      const targetPoints = estimatePointCount(
        qual,
        res,
        previewDescriptor.renderSettings.camera.zoom,
      )
      setExportProgress({ current: 0, target: targetPoints, pointsPerSec: 0 })
      setExportQuality(qual)
      setPixelRatio(res)

      // Export callback waits for quality to be reached
      type ExportInfo = { finalImageReady: boolean }
      setOnExportImage(() => (canvas: HTMLCanvasElement, info?: ExportInfo) => {
        const limitFn = qualityPointCountLimit()
        const limit = limitFn()
        const current = accumulatedPointCount()

        // Update progress
        setExportProgress((prev) => ({
          current,
          target: limit > 0 ? limit : (prev?.target ?? targetPoints),
          pointsPerSec: prev?.pointsPerSec ?? 0,
        }))

        // Not yet reached quality (or the final color-graded image is not on
        // the canvas yet) — keep rendering unless force-stopped
        if (
          (current < limit || info?.finalImageReady !== true) &&
          !forceExportNow()
        )
          return

        // Quality reached or force-exported
        setForceExportNow(false)
        setOnExportImage(undefined)
        setPixelRatio(currentRatio)
        setExportQuality(undefined)
        setExportProgress(undefined)

        // Restore original render settings so the workspace is not permanently
        // modified by the export dialog adjustments.
        setFlameDescriptor((draft) => {
          draft.renderSettings.exposure = originalSettings.exposure
          draft.renderSettings.vibrancy = originalSettings.vibrancy
          draft.renderSettings.contrast = originalSettings.contrast
          draft.renderSettings.gamma = originalSettings.gamma
          draft.renderSettings.drawMode = originalSettings.drawMode
          draft.renderSettings.backgroundColor =
            originalSettings.backgroundColor
          draft.renderSettings.camera.zoom = originalSettings.camera.zoom
          draft.renderSettings.camera.position = [
            originalSettings.camera.position[0],
            originalSettings.camera.position[1],
          ]
        })

        canvas.toBlob(
          async (blob) => {
            if (!blob) return
            const imgData = await blob.arrayBuffer()
            let pngBytes = new Uint8Array(imgData)
            const exportTracks = timeline?.tracks() ?? []
            if (doEmbedFlame) {
              const cfg = timeline?.config() ?? defaultTimelineConfig()
              const doCondense = condenseHidden()
              const flame = doCondense
                ? condenseFlameDescriptor(flameDescriptor)
                : flameDescriptor
              const payload =
                doEmbedAnimation && exportTracks.length > 0
                  ? {
                      flame,
                      animation: { tracks: exportTracks, config: cfg },
                    }
                  : flame
              const encoded = await compressJsonQueryParam(payload)
              pngBytes = new Uint8Array(
                await addFlameDataToPng(encoded, pngBytes).arrayBuffer(),
              )
            }
            saveRecentFlame(flameDescriptor, undefined, exportTracks)
            const fileUrlExt = URL.createObjectURL(
              new Blob([pngBytes], { type: 'image/png' }),
            )
            const downloadLink = window.document.createElement('a')
            downloadLink.href = fileUrlExt
            downloadLink.download = 'flame.png'
            downloadLink.click()
          },
          'image/png',
          1,
        )
      })
    }

    function handleRenderAnimation() {
      if (!startAnimationExport) return
      // Apply the opt-in before the export locks canvas interaction.
      setCameraDuringExportEnabled(cameraDuringExport())
      const exportConfig: AnimationExportConfig = {
        quality: animationQuality(),
        resolution: resolution(),
        fps: animFps(),
        frameStart: frameStart(),
        frameEnd: frameEnd(),
        playCount: playCount(),
        codec: codec(),
        embedMetadata: embedMetadata(),
      }
      // The canvas will be obtained from the Flam3 component in App.tsx
      // For now, we pass config and the factory calls startAnimationExport
      startAnimationExport(exportConfig, document.createElement('canvas'))
    }

    setExportModalIsOpen(true)
    await requestModal({
      class: ui.container,
      content: ({ respond }) => (
        <RenderDialog
          resolution={resolution()}
          quality={quality()}
          embedFlame={embedFlame()}
          embedAnimation={embedAnimation()}
          condenseHidden={condenseHidden()}
          hasAnimation={hasAnimation}
          tracks={tracks}
          config={config}
          previewDescriptor={previewDescriptor}
          setPreviewDescriptor={
            setPreviewDescriptor as (...args: unknown[]) => void
          }
          selectedPalette={selectedPalette}
          onResolutionChange={setResolution}
          onQualityChange={setQuality}
          onEmbedFlameChange={setEmbedFlame}
          onEmbedAnimationChange={setEmbedAnimation}
          onCondenseHiddenChange={setCondenseHidden}
          onCancel={() => {
            respond()
          }}
          onExport={() => {
            handleExport()
            respond()
          }}
          exportTab={exportTab()}
          onExportTabChange={setExportTab}
          animationQuality={animationQuality()}
          onAnimationQualityChange={setAnimationQuality}
          frameStart={frameStart()}
          onFrameStartChange={setFrameStart}
          frameEnd={frameEnd()}
          onFrameEndChange={setFrameEnd}
          animFps={animFps()}
          onAnimFpsChange={setAnimFps}
          playCount={playCount()}
          onPlayCountChange={setPlayCount}
          codec={codec()}
          onCodecChange={setCodec}
          embedMetadata={embedMetadata()}
          onEmbedMetadataChange={setEmbedMetadata}
          cameraDuringExport={cameraDuringExport()}
          onCameraDuringExportChange={setCameraDuringExport}
          onRenderAnimation={() => {
            handleRenderAnimation()
            respond()
          }}
        />
      ),
    })
    setExportModalIsOpen(false)
  }

  return { showExportPngDialog, quickExport, exportModalIsOpen }
}
