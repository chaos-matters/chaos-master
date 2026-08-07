import { createSignal, Show } from 'solid-js'
import { createStore } from 'solid-js/store'
import { vec2f, vec3f, vec4f } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import { ScrubInput } from '@/components/Sliders/ScrubInput'
import { Slider } from '@/components/Sliders/Slider'
import { ALLOW_CAMERA_DURING_EXPORT, DEFAULT_POINT_COUNT, DEFAULT_PREVIEW_PIXEL_RATIO, } from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import { setCameraDuringExportEnabled } from '@/flame/renderStats'
import { MAX_CAMERA_ZOOM_VALUE, MIN_CAMERA_ZOOM_VALUE, } from '@/flame/schema/flameSchema'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Root } from '@/lib/Root'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { WheelZoomCamera3D } from '@/lib/WheelZoomCamera3D'
import { lastFinishedSession } from '@/recorder/recorder'
import { deepClone } from '@/utils/clone'
import { computeExportDimensions, DEFAULT_EXPORT_ASPECT, DEFAULT_EXPORT_RESOLUTION, } from '@/utils/exportDimensions'
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
import { ExportFormatCard } from './ExportFormatCard'
import ui from './ExportPngDialog.module.css'
import { FramePreviewGallery } from './FramePreviewGallery'
import type { Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { Vec3 } from 'wgpu-matrix'
import type { ExportImageType } from '@/App'
import type { Palette } from '@/flame/colorMap'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { AnimationExportConfig } from '@/utils/animationExport'
import type { AudioMappingEntry } from '@/utils/audioAnalysis'
import type { ExportAspectKey } from '@/utils/exportDimensions'
import type { AnimationJobSpec, ImageJobSpec } from '@/utils/exportJobs'
import type { TimelineConfig, TimelineState, TimelineTrack, } from '@/utils/timeline'
import type { VideoEncoderConfig } from '@/utils/videoEncoder'

const QUALITY_MIN = 0.5
const QUALITY_MAX = 0.9999

type RenderDialogProps = {
  resolution: number
  aspect: ExportAspectKey
  viewportAspect: number
  quality: number
  embedFlame: boolean
  embedAnimation: boolean
  condenseHidden: boolean
  hasAnimation: boolean
  tracks: TimelineTrack[]
  config: TimelineConfig
  /** Timeline frame the preview snapshot was taken at (animated flames). */
  previewFrame: number
  /** Re-snapshot the preview from the timeline's current frame. */
  onSyncFrame: () => void
  previewDescriptor: FlameDescriptor
  setPreviewDescriptor: (...args: unknown[]) => void
  selectedPalette: () => Palette | undefined
  blendFlame?: () => FlameDescriptor | undefined
  blendWeight?: () => number
  onResolutionChange: (v: number) => void
  onAspectChange: (v: ExportAspectKey) => void
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
  animationOffscreen: boolean
  onAnimationOffscreenChange: (v: boolean) => void
  onRenderAnimation: () => void
}

function RenderDialog(props: RenderDialogProps) {
  const [renderMode, setRenderMode] = createSignal<'auto' | 'manual'>('auto')
  const [renderKey, setRenderKey] = createSignal(0)
  // True while the animation frame-preview gallery is rendering — locks the
  // resolution/aspect controls so they can't be changed mid-render.
  const [previewsRendering, setPreviewsRendering] = createSignal(false)
  const [previewPoints, setPreviewPoints] = createSignal(0)
  const [previewLimitFn, setPreviewLimitFn] = createSignal<() => number>(
    () => 0,
  )

  const cameraPos = () =>
    vec2f(
      props.previewDescriptor.renderSettings.camera.position[0],
      props.previewDescriptor.renderSettings.camera.position[1],
    )

  const is3D = () =>
    (props.previewDescriptor.renderSettings.dimensions ?? 2) === 3

  const updateCamera3D = (
    updater: (
      cam: NonNullable<FlameDescriptor['renderSettings']['camera3D']>,
    ) => void,
  ) => {
    const current = deepClone(
      props.previewDescriptor.renderSettings.camera3D ?? {
        theta: 0,
        phi: Math.PI / 2,
        radius: 5,
        target: [0, 0, 0],
        fov: 60,
      },
    )
    updater(current)
    props.setPreviewDescriptor('renderSettings', 'camera3D', current)
  }

  const setFlameTheta: Setter<number> = (v) => {
    const next =
      typeof v === 'function'
        ? v(props.previewDescriptor.renderSettings.camera3D?.theta ?? 0)
        : v
    updateCamera3D((c) => {
      c.theta = next
    })
    return next
  }
  const setFlamePhi: Setter<number> = (v) => {
    const next =
      typeof v === 'function'
        ? v(props.previewDescriptor.renderSettings.camera3D?.phi ?? Math.PI / 2)
        : v
    updateCamera3D((c) => {
      c.phi = next
    })
    return next
  }
  const setFlameRadius: Setter<number> = (v) => {
    const next =
      typeof v === 'function'
        ? v(props.previewDescriptor.renderSettings.camera3D?.radius ?? 5)
        : v
    updateCamera3D((c) => {
      c.radius = next
    })
    return next
  }
  const setFlameTarget3D = (v: Vec3 | ((prev: Vec3) => Vec3)) => {
    const next =
      typeof v === 'function'
        ? v(
            new Float32Array(
              props.previewDescriptor.renderSettings.camera3D?.target ?? [
                0, 0, 0,
              ],
            ),
          )
        : v
    updateCamera3D((c) => {
      c.target = [next[0] ?? 0, next[1] ?? 0, next[2] ?? 0]
    })
    return new Float32Array(next)
  }
  const setFlameFov: Setter<number> = (v) => {
    const next =
      typeof v === 'function'
        ? v(props.previewDescriptor.renderSettings.camera3D?.fov ?? 60)
        : v
    updateCamera3D((c) => {
      c.fov = next
    })
    return next
  }

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
              {/* Animated flames: the preview is a snapshot of one timeline
                  frame — say which, and let the user re-sync while playback
                  or scrubbing moves the workspace canvas on without us. */}
              <Show when={props.hasAnimation}>
                <span
                  class={ui.frameChip}
                  title="The preview and the exported image use the flame state at this timeline frame"
                >
                  Frame {props.previewFrame}/{props.config.endFrame}
                </span>
                <button
                  type="button"
                  class={ui.frameSyncBtn}
                  onClick={() => {
                    props.onSyncFrame()
                    if (renderMode() === 'manual') setRenderKey((k) => k + 1)
                  }}
                  title="Re-snapshot the preview from the timeline's current frame"
                >
                  Sync frame
                </button>
              </Show>
            </div>
            <Root adapterOptions={{ powerPreference: 'high-performance' }}>
              <AutoCanvas pixelRatio={DEFAULT_PREVIEW_PIXEL_RATIO}>
                <Show
                  when={is3D()}
                  fallback={
                    <WheelZoomCamera2D
                      zoom={[
                        () =>
                          props.previewDescriptor.renderSettings.camera.zoom,
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
                          adaptiveFilterEnabled={true}
                          animationEnabled={false}
                          flameDescriptor={props.previewDescriptor}
                          blendFlame={props.blendFlame?.()}
                          blendWeight={props.blendWeight?.()}
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
                  }
                >
                  <WheelZoomCamera3D
                    theta={[
                      () =>
                        props.previewDescriptor.renderSettings.camera3D
                          ?.theta ?? 0,
                      setFlameTheta,
                    ]}
                    phi={[
                      () =>
                        props.previewDescriptor.renderSettings.camera3D?.phi ??
                        Math.PI / 2,
                      setFlamePhi,
                    ]}
                    radius={[
                      () =>
                        props.previewDescriptor.renderSettings.camera3D
                          ?.radius ?? 5,
                      setFlameRadius,
                    ]}
                    target={[
                      () =>
                        new Float32Array(
                          props.previewDescriptor.renderSettings.camera3D
                            ?.target ?? [0, 0, 0],
                        ),
                      setFlameTarget3D,
                    ]}
                    fov={[
                      () =>
                        props.previewDescriptor.renderSettings.camera3D?.fov ??
                        60,
                      setFlameFov,
                    ]}
                    roll={[
                      () =>
                        props.previewDescriptor.renderSettings.camera3D?.roll ??
                        0,
                      () => 0,
                    ]}
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
                        adaptiveFilterEnabled={true}
                        animationEnabled={false}
                        flameDescriptor={props.previewDescriptor}
                        blendFlame={props.blendFlame?.()}
                        blendWeight={props.blendWeight?.()}
                        renderInterval={renderMode() === 'auto' ? 1 : 0}
                        edgeFadeColor={vec4f(0)}
                        palette={props.selectedPalette}
                        onAccumulatedPointCount={setPreviewPoints}
                        setQualityPointCountLimit={(fn) =>
                          setPreviewLimitFn(() => fn)
                        }
                      />
                    </Show>
                  </WheelZoomCamera3D>
                </Show>
              </AutoCanvas>
            </Root>
          </div>
          <div class={ui.controlsPane}>
            <ExportFormatCard
              resolution={props.resolution}
              onResolutionChange={props.onResolutionChange}
              aspect={props.aspect}
              onAspectChange={props.onAspectChange}
              viewportAspect={props.viewportAspect}
            />

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

            <Show when={props.hasAnimation}>
              <div
                class={ui.frameAtHint}
                title="Slider values reflect the snapshotted timeline frame, not the base flame"
              >
                @ frame {props.previewFrame}
              </div>
            </Show>
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

            <Show when={is3D()}>
              <div class={ui.sliderField}>
                <Slider
                  label="Depth Coloring"
                  value={
                    props.previewDescriptor.renderSettings.depthColorPower ??
                    0.0
                  }
                  min={0}
                  max={5}
                  step={0.05}
                  onInput={(v) => {
                    props.setPreviewDescriptor(
                      'renderSettings',
                      'depthColorPower',
                      v,
                    )
                  }}
                />
              </div>
              <div class={ui.sliderField}>
                <Slider
                  label="Light Power"
                  value={
                    props.previewDescriptor.renderSettings.lightPower ?? 0.0
                  }
                  min={0}
                  max={1.5}
                  step={0.01}
                  onInput={(v) => {
                    props.setPreviewDescriptor(
                      'renderSettings',
                      'lightPower',
                      v,
                    )
                  }}
                />
              </div>
            </Show>

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

            <label class={ui.field}>
              <span>Name</span>
              <input
                type="text"
                class={ui.numberInput}
                value={props.previewDescriptor.metadata?.name ?? ''}
                onInput={(e) => {
                  props.setPreviewDescriptor(
                    'metadata',
                    'name',
                    e.currentTarget.value,
                  )
                }}
              />
            </label>

            <label class={ui.field}>
              <span>Description</span>
              <textarea
                class={ui.textarea}
                value={props.previewDescriptor.metadata?.description ?? ''}
                onInput={(e) => {
                  props.setPreviewDescriptor(
                    'metadata',
                    'description',
                    e.currentTarget.value,
                  )
                }}
              />
            </label>

            <label class={ui.field}>
              <span>Author</span>
              <input
                type="text"
                class={ui.numberInput}
                value={props.previewDescriptor.metadata?.author ?? ''}
                onInput={(e) => {
                  props.setPreviewDescriptor(
                    'metadata',
                    'author',
                    e.currentTarget.value,
                  )
                }}
              />
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
              aspect={props.aspect}
              viewportAspect={props.viewportAspect}
              onGeneratingChange={setPreviewsRendering}
            />
          </div>
          <div class={ui.controlsPane}>
            <ExportFormatCard
              resolution={props.resolution}
              onResolutionChange={props.onResolutionChange}
              aspect={props.aspect}
              onAspectChange={props.onAspectChange}
              viewportAspect={props.viewportAspect}
              disabled={previewsRendering()}
            />

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

            <label class={ui.field}>
              <span>Name</span>
              <input
                type="text"
                class={ui.numberInput}
                value={props.previewDescriptor.metadata?.name ?? ''}
                onInput={(e) => {
                  props.setPreviewDescriptor(
                    'metadata',
                    'name',
                    e.currentTarget.value,
                  )
                }}
              />
            </label>

            <label class={ui.field}>
              <span>Description</span>
              <textarea
                class={ui.textarea}
                value={props.previewDescriptor.metadata?.description ?? ''}
                onInput={(e) => {
                  props.setPreviewDescriptor(
                    'metadata',
                    'description',
                    e.currentTarget.value,
                  )
                }}
              />
            </label>

            <label class={ui.field}>
              <span>Author</span>
              <input
                type="text"
                class={ui.numberInput}
                value={props.previewDescriptor.metadata?.author ?? ''}
                onInput={(e) => {
                  props.setPreviewDescriptor(
                    'metadata',
                    'author',
                    e.currentTarget.value,
                  )
                }}
              />
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
              title="Render the video offscreen as a background job so you can keep using the app. Progress + download appear in the top-right export tracker. Off = render on the main canvas (locks the workspace)."
            >
              <Checkbox
                checked={props.animationOffscreen}
                onChange={(checked) => {
                  props.onAnimationOffscreenChange(checked)
                }}
              />
              <span>Render in background (offscreen)</span>
            </label>

            <label
              class={ui.checkboxField}
              classList={{
                [ui.disabled as string]: props.animationOffscreen,
              }}
              title="Keep camera pan/scroll/zoom active while rendering — your live camera moves get baked into the video. Leave off for a deterministic export. (Main-canvas render only.)"
            >
              <Checkbox
                checked={props.cameraDuringExport && !props.animationOffscreen}
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
  getViewportAspect: () => number,
  enqueueImageJob: (spec: ImageJobSpec) => void,
  enqueueAnimationJob: (spec: AnimationJobSpec) => void,
  startAnimationExport?: (
    config: AnimationExportConfig,
    canvas: HTMLCanvasElement,
  ) => void,
  getBlendFlame?: () => FlameDescriptor | undefined,
  getBlendWeight?: () => number,
  getAudioBuffer?: () => AudioBuffer | undefined,
  getAudioMapping?: () => AudioMappingEntry[],
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
          // If a session was recorded for this flame, it rides along in a
          // second chunk, so a dropped PNG can offer to replay how it was
          // made (docs/plans/semantic-recorder-plan.md, M5).
          const session = lastFinishedSession()
          const encodedSteps = session
            ? await compressJsonQueryParam(session)
            : undefined
          pngBytes = new Uint8Array(
            await addFlameDataToPng(
              encoded,
              pngBytes,
              encodedSteps,
            ).arrayBuffer(),
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

  async function showExportPngDialog(initialTab?: 'image' | 'animation') {
    const timeline = getTimeline()
    const tracks = timeline?.tracks() ?? []
    const config = timeline?.config() ?? defaultTimelineConfig()
    const hasAnimation = tracks.some((track) => track.keyframes.length > 0)
    const currentFrame = timeline?.currentFrame() ?? 0
    const viewportAspect = getViewportAspect()

    const [resolution, setResolution] = persistentSignal(
      'export/resolution-px',
      DEFAULT_EXPORT_RESOLUTION,
    )
    const [aspect, setAspect] = persistentSignal<ExportAspectKey>(
      'export/aspect',
      DEFAULT_EXPORT_ASPECT,
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

    if (initialTab) {
      setExportTab(initialTab)
    }

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
    const [animationOffscreen, setAnimationOffscreen] = persistentSignal(
      'export/animation-offscreen',
      false,
    )

    const initialFlame = deepClone(flameDescriptor)
    if (!initialFlame.metadata) {
      initialFlame.metadata = { name: '', description: '', author: 'unknown' }
    } else {
      if (initialFlame.metadata.name === undefined)
        initialFlame.metadata.name = ''
      if (initialFlame.metadata.description === undefined)
        initialFlame.metadata.description = ''
      if (initialFlame.metadata.author === undefined)
        initialFlame.metadata.author = 'unknown'
    }
    if (timeline && hasAnimation) {
      applyTimelineToFlameAtFrame(timeline, initialFlame, currentFrame)
    }

    const [previewDescriptor, setPreviewDescriptor] = createStore(initialFlame)
    // Which timeline frame the snapshot above reflects. Playback/scrubbing
    // moves the workspace canvas on after the dialog opens — the chip in the
    // preview toolbar shows this frame and Sync re-snapshots on demand.
    const [previewFrame, setPreviewFrame] = createSignal(currentFrame)

    function syncPreviewToCurrentFrame() {
      const t = getTimeline()
      if (!t || !hasAnimation) return
      const frame = t.currentFrame()
      const fresh = deepClone(flameDescriptor)
      applyTimelineToFlameAtFrame(t, fresh, frame)
      // Keep the dialog's metadata edits — only the flame state re-snapshots.
      if (previewDescriptor.metadata) {
        fresh.metadata = { ...previewDescriptor.metadata }
      }
      setPreviewDescriptor(fresh)
      setPreviewFrame(frame)
    }

    function handleExport() {
      const dimensions = computeExportDimensions(
        resolution(),
        aspect(),
        viewportAspect,
      )

      // Persist the dialog's metadata edits back to the workspace flame (the
      // render-setting edits stay scoped to the export — they go into the job
      // snapshot below, not the workspace flame).
      setFlameDescriptor((draft) => {
        if (!draft.metadata) {
          draft.metadata = { name: '', description: '', author: 'unknown' }
        }
        draft.metadata.name = previewDescriptor.metadata?.name ?? ''
        draft.metadata.description =
          previewDescriptor.metadata?.description ?? ''
        draft.metadata.author = previewDescriptor.metadata?.author ?? 'unknown'
      })

      // Enqueue an offscreen background render job. The job owns a deep-cloned
      // snapshot of the dialog's edited flame, so workspace edits after this
      // point don't affect the in-flight render. Progress + download surface in
      // the top-right ExportJobTracker; the workspace stays usable meanwhile.
      enqueueImageJob({
        name: previewDescriptor.metadata?.name?.trim() || 'flame',
        flame: deepClone(previewDescriptor),
        quality: quality(),
        dimensions,
        palette: selectedPalette(),
        blendFlame: getBlendFlame?.(),
        blendWeight: getBlendWeight?.() ?? 0,
        embedFlame: embedFlame(),
        embedAnimation: embedAnimation() && hasAnimation,
        condenseHidden: condenseHidden(),
        tracks: timeline?.tracks() ?? [],
        config: timeline?.config() ?? defaultTimelineConfig(),
      })
    }

    function handleRenderAnimation() {
      // Sync metadata back to workspace flame descriptor
      setFlameDescriptor((draft) => {
        if (!draft.metadata) {
          draft.metadata = { name: '', description: '', author: 'unknown' }
        }
        draft.metadata.name = previewDescriptor.metadata?.name ?? ''
        draft.metadata.description =
          previewDescriptor.metadata?.description ?? ''
        draft.metadata.author = previewDescriptor.metadata?.author ?? 'unknown'
      })
      const dimensions = computeExportDimensions(
        resolution(),
        aspect(),
        viewportAspect,
      )

      // Offscreen: enqueue a background job (workspace stays usable). Renders the
      // RAW workspace flame; the job applies the timeline per frame.
      if (animationOffscreen()) {
        enqueueAnimationJob({
          name: previewDescriptor.metadata?.name?.trim() || 'flame',
          flame: deepClone(flameDescriptor),
          quality: animationQuality(),
          dimensions,
          fps: animFps(),
          frameStart: frameStart(),
          frameEnd: frameEnd(),
          playCount: playCount(),
          codec: codec(),
          embedMetadata: embedMetadata(),
          palette: selectedPalette(),
          blendFlame: getBlendFlame?.(),
          blendWeight: getBlendWeight?.() ?? 0,
          tracks: timeline?.tracks() ?? [],
          config: timeline?.config() ?? defaultTimelineConfig(),
          audioBuffer: getAudioBuffer?.(),
          audioMapping: getAudioMapping?.(),
        })
        return
      }

      // Main-canvas path (default, unchanged).
      if (!startAnimationExport) return
      // Apply the opt-in before the export locks canvas interaction.
      setCameraDuringExportEnabled(cameraDuringExport())
      const audioBuf = getAudioBuffer?.()
      const exportConfig: AnimationExportConfig = {
        quality: animationQuality(),
        width: dimensions.width,
        height: dimensions.height,
        fps: animFps(),
        frameStart: frameStart(),
        frameEnd: frameEnd(),
        playCount: playCount(),
        codec: codec(),
        embedMetadata: embedMetadata(),
        audioBuffer: audioBuf,
        audioMapping: getAudioMapping?.(),
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
          aspect={aspect()}
          viewportAspect={viewportAspect}
          quality={quality()}
          embedFlame={embedFlame()}
          embedAnimation={embedAnimation()}
          condenseHidden={condenseHidden()}
          hasAnimation={hasAnimation}
          tracks={tracks}
          config={config}
          previewFrame={previewFrame()}
          onSyncFrame={syncPreviewToCurrentFrame}
          previewDescriptor={previewDescriptor}
          setPreviewDescriptor={
            setPreviewDescriptor as (...args: unknown[]) => void
          }
          selectedPalette={selectedPalette}
          blendFlame={() => getBlendFlame?.()}
          blendWeight={() => getBlendWeight?.() ?? 0}
          onResolutionChange={setResolution}
          onAspectChange={setAspect}
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
          animationOffscreen={animationOffscreen()}
          onAnimationOffscreenChange={setAnimationOffscreen}
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
