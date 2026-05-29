import { createMemo, createSignal, For, Show } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { vec2f, vec4f } from 'typegpu/data'
import { Slider } from '@/components/Sliders/Slider'
import { DEFAULT_POINT_COUNT } from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import { generateRandomFlame } from '@/flame/randomize'
import { variationTypes } from '@/flame/variations'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Root } from '@/lib/Root'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { deepClone } from '@/utils/clone'
import { encodeIco } from '@/utils/icoEncoder'
import { addHistoryEntry, clearHistory, loadHistoryEntries, } from '@/utils/logoHistoryDB'
import { persistentSignal } from '@/utils/persistentSignal'
import { Button } from '../Button/Button'
import { Checkbox } from '../Checkbox/Checkbox'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import { defaultPills, getNearestPresetKey, QualityPresets, qualityPresets, } from '../Quality/QualityPresets'
import ui from './LogoFaviconGenerator.module.css'
import { VariationPalette } from './VariationPalette'
import type { Signal } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { Palette } from '@/flame/colorMap'
import type { GenerateRandomFlameConfig } from '@/flame/randomize'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TransformVariationType } from '@/flame/variations'
import type { ChangeHistory } from '@/utils/createStoreHistory'

function randomRange(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const RENDER_SETTING_RANGES = {
  skipIters: () => randomInt(0, 30),
  exposure: () => randomRange(-8, 8),
  contrast: () => randomRange(0.01, 20),
  gamma: () => randomRange(0.1, 8),
  highlightPower: () => randomRange(0, 2),
  vibrancy: () => randomRange(0, 3),
}

interface HistoryEntry {
  flame: FlameDescriptor
  thumbnail: string // PNG data URL
  timestamp: number
}

const MAX_HISTORY = 50
const HISTORY_THUMBNAIL_SIZE = 256

async function captureThumbnail(size: number): Promise<string | null> {
  const canvas = document.querySelector<HTMLCanvasElement>(
    `.${ui.previewCanvas} canvas`,
  )
  if (canvas === null) return null
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        resolve(null)
        return
      }
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        const offscreen = document.createElement('canvas')
        offscreen.width = size
        offscreen.height = size
        const ctx = offscreen.getContext('2d')!
        ctx.drawImage(img, 0, 0, size, size)
        URL.revokeObjectURL(url)
        resolve(offscreen.toDataURL('image/png'))
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(null)
      }
      img.src = url
    }, 'image/png')
  })
}

function RandomizeToggleButton(props: {
  enabled: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      class={ui.randomizeToggle}
      classList={{ [ui.randomizeToggleActive as string]: props.enabled }}
      title={props.enabled ? 'Randomize enabled' : 'Randomize disabled'}
      onClick={(e) => {
        e.stopPropagation()
        props.onChange(!props.enabled)
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        fill="currentColor"
      >
        <rect
          x="1.5"
          y="1.5"
          width="13"
          height="13"
          rx="3"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        />
        <circle cx="5.2" cy="5.2" r="1.5" />
        <circle cx="10.8" cy="10.8" r="1.5" />
      </svg>
    </button>
  )
}

const ICO_SIZES = [16, 32, 48, 256]

interface LogoDialogProps {
  flame: FlameDescriptor
  isGenerating: boolean
  onGenerate: () => void
  onLoadIntoMainView: () => void
  onDownloadPng: () => void
  onDownloadIco: () => void
  onCancel: () => void
  strength: number
  onStrengthChange: (v: number) => void
  minTransforms: number
  maxTransforms: number
  onMinTransformsChange: (v: number) => void
  onMaxTransformsChange: (v: number) => void
  minVariations: number
  maxVariations: number
  onMinVariationsChange: (v: number) => void
  onMaxVariationsChange: (v: number) => void
  includeBackground: boolean
  onIncludeBackgroundChange: (v: boolean) => void
  resolution: number
  onResolutionChange: (v: number) => void
  quality: number
  onQualityChange: (v: number) => void
  selectedVariations: Set<TransformVariationType>
  onToggleVariation: (t: TransformVariationType) => void
  onSelectAllVariations: () => void
  onDeselectAllVariations: () => void
  cameraZoom: Signal<number>
  cameraPosition: Signal<v2f>
  renderSettingsExpanded: boolean
  onToggleRenderSettings: () => void
  skipIters: number
  onSkipItersChange: (v: number) => void
  exposure: number
  onExposureChange: (v: number) => void
  contrast: number
  onContrastChange: (v: number) => void
  gamma: number
  onGammaChange: (v: number) => void
  highlightPower: number
  onHighlightPowerChange: (v: number) => void
  vibrancy: number
  onVibrancyChange: (v: number) => void
  randomizeSkipIters: boolean
  onRandomizeSkipItersChange: (v: boolean) => void
  randomizeExposure: boolean
  onRandomizeExposureChange: (v: boolean) => void
  randomizeContrast: boolean
  onRandomizeContrastChange: (v: boolean) => void
  randomizeGamma: boolean
  onRandomizeGammaChange: (v: boolean) => void
  randomizeHighlightPower: boolean
  onRandomizeHighlightPowerChange: (v: boolean) => void
  randomizeVibrancy: boolean
  onRandomizeVibrancyChange: (v: boolean) => void
  canvasWidth: number
  onCanvasWidthChange: (v: number) => void
  canvasHeight: number
  onCanvasHeightChange: (v: number) => void
  aspectRatioLocked: boolean
  onAspectRatioToggle: () => void
  historyEntries: HistoryEntry[]
  historyExpanded: boolean
  onToggleHistory: () => void
  onLoadHistory: (entry: HistoryEntry) => void
  onClearHistory: () => void
  onCopyHistoryImage: (entry: HistoryEntry) => void
  onDownloadHistoryPng: (entry: HistoryEntry) => void
  onDownloadHistoryIco: (entry: HistoryEntry) => void
  selectedEntryTimestamp: number
}

function numberOptions(min: number, max: number) {
  const opts: number[] = []
  for (let i = min; i <= max; i++) opts.push(i)
  return opts
}

const CANVAS_MIN_SIZE = 160
const CANVAS_MAX_SIZE = 800

function clampSize(v: number): number {
  return Math.round(Math.min(CANVAS_MAX_SIZE, Math.max(CANVAS_MIN_SIZE, v)))
}

function LogoDialog(props: LogoDialogProps) {
  const transformOptions = () => numberOptions(1, 10)
  const variationOptions = () => numberOptions(1, 5)

  const [localAccumulatedPoints, setLocalAccumulatedPoints] = createSignal(0)

  const estimatedPoints = createMemo(() => {
    const pxHeight = props.canvasHeight * (props.resolution / 256)
    const bucketInv = (pxHeight ** 2 * props.cameraZoom[0]() ** 2) / 4
    const denom = (props.quality - 1) ** 2
    if (denom === 0) return Infinity
    return Math.round(bucketInv / denom)
  })

  let resizeStartX = 0
  let resizeStartY = 0
  let resizeStartW = 0
  let resizeStartH = 0

  function onResizePointerDown(e: PointerEvent) {
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    resizeStartX = e.clientX
    resizeStartY = e.clientY
    resizeStartW = props.canvasWidth
    resizeStartH = props.canvasHeight

    function onPointerMove(ev: PointerEvent) {
      const dx = ev.clientX - resizeStartX
      const dy = ev.clientY - resizeStartY
      if (props.aspectRatioLocked) {
        const delta = Math.max(dx, dy)
        const newSize = clampSize(resizeStartW + delta)
        props.onCanvasWidthChange(newSize)
        props.onCanvasHeightChange(newSize)
      } else {
        props.onCanvasWidthChange(clampSize(resizeStartW + dx))
        props.onCanvasHeightChange(clampSize(resizeStartH + dy))
      }
    }

    function onPointerUp(ev: PointerEvent) {
      target.releasePointerCapture(ev.pointerId)
      target.removeEventListener('pointermove', onPointerMove)
      target.removeEventListener('pointerup', onPointerUp)
    }
    target.addEventListener('pointermove', onPointerMove)
    target.addEventListener('pointerup', onPointerUp)
  }

  return (
    <>
      <ModalTitleBar onClose={props.onCancel}>Icon Generator</ModalTitleBar>
      <div class={ui.dialogBody}>
        {/* Left panel — live preview */}
        <div class={ui.previewPane}>
          <div class={ui.previewCanvasWrap}>
            <div
              class={ui.previewCanvas}
              style={{
                width: `${props.canvasWidth}px`,
                height: `${props.canvasHeight}px`,
              }}
            >
              <Root adapterOptions={{ powerPreference: 'high-performance' }}>
                <AutoCanvas
                  pixelRatio={props.resolution / 256}
                  alphaMode="premultiplied"
                >
                  <WheelZoomCamera2D
                    zoom={props.cameraZoom}
                    position={props.cameraPosition}
                  >
                    <Flam3
                      quality={props.quality}
                      pointCountPerBatch={DEFAULT_POINT_COUNT}
                      adaptiveFilterEnabled={false}
                      animationEnabled={false}
                      flameDescriptor={props.flame}
                      renderInterval={1}
                      edgeFadeColor={vec4f(0)}
                      palette={() => undefined}
                      outputAlpha={!props.includeBackground}
                      onAccumulatedPointCount={setLocalAccumulatedPoints}
                    />
                  </WheelZoomCamera2D>
                </AutoCanvas>
              </Root>
            </div>
            <div class={ui.resizeHandle} onPointerDown={onResizePointerDown}>
              <svg
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              >
                <line x1="10" y1="2" x2="2" y2="10" />
                <line x1="10" y1="6" x2="6" y2="10" />
              </svg>
            </div>
          </div>
          <div class={ui.previewToolbar}>
            <button
              type="button"
              class={ui.aspectLock}
              classList={{
                [ui.aspectLockLocked as string]: props.aspectRatioLocked,
              }}
              title={
                props.aspectRatioLocked
                  ? 'Aspect ratio locked'
                  : 'Aspect ratio unlocked'
              }
              onClick={props.onAspectRatioToggle}
            >
              {props.aspectRatioLocked ? (
                <svg viewBox="0 0 16 16" fill="currentColor">
                  <path d="M11 7V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h3v-2H4.5V5h5v2H11z" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.2"
                  stroke-linecap="round"
                >
                  <rect x="3" y="4" width="5" height="5" rx="1" />
                  <rect x="8" y="7" width="5" height="5" rx="1" />
                </svg>
              )}
            </button>
            <span class={ui.previewSizeLabel}>
              {props.canvasWidth} x {props.canvasHeight}
            </span>
          </div>
          <button
            type="button"
            class={ui.generateButton}
            onClick={props.onGenerate}
            disabled={props.isGenerating}
            classList={{
              [ui.generateButtonDisabled as string]: props.isGenerating,
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
              class={ui.btnIcon}
            >
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
            {props.isGenerating ? 'Generating...' : 'Generate Random'}
          </button>

          {/* Render settings */}
          <button
            type="button"
            class={ui.collapsibleHeader}
            classList={{
              [ui.collapsibleExpanded as string]: props.renderSettingsExpanded,
            }}
            onClick={props.onToggleRenderSettings}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class={ui.chevron}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Render Settings
          </button>
          <Show when={props.renderSettingsExpanded}>
            <div class={ui.renderGrid}>
              <label class={ui.renderField}>
                <div class={ui.renderLabelRow}>
                  <span class={ui.renderLabel}>Skip Iters</span>
                  <RandomizeToggleButton
                    enabled={props.randomizeSkipIters}
                    onChange={props.onRandomizeSkipItersChange}
                  />
                </div>
                <Slider
                  value={props.skipIters}
                  min={0}
                  max={30}
                  step={1}
                  onInput={props.onSkipItersChange}
                />
              </label>
              <label class={ui.renderField}>
                <div class={ui.renderLabelRow}>
                  <span class={ui.renderLabel}>Exposure</span>
                  <RandomizeToggleButton
                    enabled={props.randomizeExposure}
                    onChange={props.onRandomizeExposureChange}
                  />
                </div>
                <Slider
                  value={props.exposure}
                  min={-4}
                  max={4}
                  step={0.01}
                  onInput={props.onExposureChange}
                />
              </label>
              <label class={ui.renderField}>
                <div class={ui.renderLabelRow}>
                  <span class={ui.renderLabel}>Contrast</span>
                  <RandomizeToggleButton
                    enabled={props.randomizeContrast}
                    onChange={props.onRandomizeContrastChange}
                  />
                </div>
                <Slider
                  value={props.contrast}
                  min={0.1}
                  max={10}
                  step={0.01}
                  onInput={props.onContrastChange}
                />
              </label>
              <label class={ui.renderField}>
                <div class={ui.renderLabelRow}>
                  <span class={ui.renderLabel}>Gamma</span>
                  <RandomizeToggleButton
                    enabled={props.randomizeGamma}
                    onChange={props.onRandomizeGammaChange}
                  />
                </div>
                <Slider
                  value={props.gamma}
                  min={0.2}
                  max={5}
                  step={0.01}
                  onInput={props.onGammaChange}
                />
              </label>
              <label class={ui.renderField}>
                <div class={ui.renderLabelRow}>
                  <span class={ui.renderLabel}>Highlight</span>
                  <RandomizeToggleButton
                    enabled={props.randomizeHighlightPower}
                    onChange={props.onRandomizeHighlightPowerChange}
                  />
                </div>
                <Slider
                  value={props.highlightPower}
                  min={0}
                  max={1}
                  step={0.01}
                  onInput={props.onHighlightPowerChange}
                />
              </label>
              <label class={ui.renderField}>
                <div class={ui.renderLabelRow}>
                  <span class={ui.renderLabel}>Vibrancy</span>
                  <RandomizeToggleButton
                    enabled={props.randomizeVibrancy}
                    onChange={props.onRandomizeVibrancyChange}
                  />
                </div>
                <Slider
                  value={props.vibrancy}
                  min={0}
                  max={1}
                  step={0.01}
                  onInput={props.onVibrancyChange}
                />
              </label>
            </div>
          </Show>

          {/* History — always visible so users can discover the feature */}
          <LogoHistory
            entries={props.historyEntries}
            expanded={props.historyExpanded}
            onToggle={props.onToggleHistory}
            onLoad={props.onLoadHistory}
            onClear={props.onClearHistory}
            onCopyImage={props.onCopyHistoryImage}
            onDownloadPng={props.onDownloadHistoryPng}
            onDownloadIco={props.onDownloadHistoryIco}
            selectedTimestamp={props.selectedEntryTimestamp}
          />
        </div>

        {/* Right panel — controls */}
        <div class={ui.controlsPane}>
          {/* Randomness strength */}
          <div class={ui.field}>
            <span class={ui.fieldLabel}>Randomness</span>
            <div class={ui.sliderField}>
              <Slider
                value={props.strength}
                min={0}
                max={1}
                step={0.01}
                onInput={props.onStrengthChange}
                formatValue={(v) => `${Math.round(v * 100)} %`}
              />
            </div>
          </div>

          {/* Transform count */}
          <div class={ui.fieldRow}>
            <label class={ui.field}>
              <span class={ui.fieldLabel}>Transf. Min</span>
              <select
                class={ui.select}
                value={props.minTransforms}
                onChange={(e) => {
                  const v = Number(e.currentTarget.value)
                  props.onMinTransformsChange(v)
                  if (v > props.maxTransforms) props.onMaxTransformsChange(v)
                }}
              >
                <For each={transformOptions()}>
                  {(n) => <option value={n}>{n}</option>}
                </For>
              </select>
            </label>
            <label class={ui.field}>
              <span class={ui.fieldLabel}>Max</span>
              <select
                class={ui.select}
                value={props.maxTransforms}
                onChange={(e) => {
                  const v = Number(e.currentTarget.value)
                  props.onMaxTransformsChange(v)
                  if (v < props.minTransforms) props.onMinTransformsChange(v)
                }}
              >
                <For each={transformOptions()}>
                  {(n) => <option value={n}>{n}</option>}
                </For>
              </select>
            </label>
          </div>

          {/* Variation count per transform */}
          <div class={ui.fieldRow}>
            <label class={ui.field}>
              <span class={ui.fieldLabel}>Var. Min</span>
              <select
                class={ui.select}
                value={props.minVariations}
                onChange={(e) => {
                  const v = Number(e.currentTarget.value)
                  props.onMinVariationsChange(v)
                  if (v > props.maxVariations) props.onMaxVariationsChange(v)
                }}
              >
                <For each={variationOptions()}>
                  {(n) => <option value={n}>{n}</option>}
                </For>
              </select>
            </label>
            <label class={ui.field}>
              <span class={ui.fieldLabel}>Max</span>
              <select
                class={ui.select}
                value={props.maxVariations}
                onChange={(e) => {
                  const v = Number(e.currentTarget.value)
                  props.onMaxVariationsChange(v)
                  if (v < props.minVariations) props.onMinVariationsChange(v)
                }}
              >
                <For each={variationOptions()}>
                  {(n) => <option value={n}>{n}</option>}
                </For>
              </select>
            </label>
          </div>

          {/* Quality preset selector */}
          <div class={ui.field}>
            <span class={ui.fieldLabel}>Quality</span>
            <QualityPresets
              pills={defaultPills}
              selectedKey={getNearestPresetKey(props.quality)}
              onSelect={(key) => {
                props.onQualityChange(
                  qualityPresets[key as keyof typeof qualityPresets],
                )
              }}
              allPillsFill={true}
              currentPoints={localAccumulatedPoints()}
              targetPoints={estimatedPoints()}
            />
          </div>

          {/* Resolution selector */}
          <label class={ui.field}>
            <span class={ui.fieldLabel}>Resolution</span>
            <select
              class={ui.select}
              value={props.resolution}
              onChange={(e) => {
                props.onResolutionChange(Number(e.currentTarget.value))
              }}
            >
              <option value={128}>128</option>
              <option value={256}>256</option>
              <option value={512}>512</option>
              <option value={1024}>1024</option>
            </select>
          </label>

          {/* Include background toggle */}
          <label class={ui.checkboxField}>
            <Checkbox
              checked={props.includeBackground}
              onChange={props.onIncludeBackgroundChange}
            />
            <span>Include Background</span>
          </label>

          {/* Variation palette */}
          <div class={ui.paletteSection}>
            <span class={ui.fieldLabel}>Variation Palette</span>
            <VariationPalette
              allVariations={[...variationTypes]}
              selected={props.selectedVariations}
              onToggle={props.onToggleVariation}
              onSelectAll={props.onSelectAllVariations}
              onDeselectAll={props.onDeselectAllVariations}
            />
          </div>
        </div>
      </div>

      {/* Footer with action buttons */}
      <footer class={ui.footer}>
        <Button onClick={props.onLoadIntoMainView}>Load</Button>
        <Button onClick={props.onDownloadPng}>Download PNG</Button>
        <Button onClick={props.onDownloadIco}>Download ICO</Button>
      </footer>
    </>
  )
}

function LogoHistory(props: {
  entries: HistoryEntry[]
  expanded: boolean
  onToggle: () => void
  onLoad: (entry: HistoryEntry) => void
  onClear: () => void
  onCopyImage: (entry: HistoryEntry) => void
  onDownloadPng: (entry: HistoryEntry) => void
  onDownloadIco: (entry: HistoryEntry) => void
  selectedTimestamp?: number
}) {
  return (
    <div class={ui.historySection}>
      <button
        type="button"
        class={ui.collapsibleHeader}
        classList={{
          [ui.collapsibleExpanded as string]: props.expanded,
        }}
        onClick={props.onToggle}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class={ui.chevron}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        History ({props.entries.length})
        {props.entries.length > 0 && (
          <span
            class={ui.historyClear}
            onClick={(e) => {
              e.stopPropagation()
              props.onClear()
            }}
            title="Clear history"
          >
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              width="12"
              height="12"
              style="margin-left: 4px;"
            >
              <path d="M3 2h10l-1 12H4L3 2zm3 0V1h4v1h3v2H3V2h3z" />
            </svg>
          </span>
        )}
      </button>
      <Show when={props.expanded && props.entries.length > 0}>
        <div class={ui.historyGrid}>
          <For each={props.entries}>
            {(entry) => (
              <div
                class={ui.historyItem}
                classList={{
                  [ui.historyItemSelected as string]:
                    entry.timestamp === props.selectedTimestamp,
                }}
              >
                <button
                  type="button"
                  class={ui.historyThumbBtn}
                  onClick={() => {
                    props.onLoad(entry)
                  }}
                  title="Load into editor"
                >
                  <img
                    src={entry.thumbnail}
                    alt="History preview"
                    class={ui.historyThumb}
                  />
                </button>
                <div class={ui.historyActions}>
                  <button
                    type="button"
                    class={ui.historyActionBtn}
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onCopyImage(entry)
                    }}
                    title="Copy image to clipboard"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      width="14"
                      height="14"
                    >
                      <path d="M4 2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h1v-1H4V3h7v2h1V3a1 1 0 0 0-1-1H4zm3 4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H7zm0 1h7v7H7V7z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class={ui.historyActionBtn}
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onDownloadPng(entry)
                    }}
                    title="Download PNG"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      width="14"
                      height="14"
                    >
                      <path d="M8 10l-3-3h2V3h2v4h2l-3 3zm-6 3h12v-1H2v1z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class={ui.historyActionBtn}
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onDownloadIco(entry)
                    }}
                    title="Download ICO"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      width="14"
                      height="14"
                    >
                      <rect
                        x="2"
                        y="2"
                        width="12"
                        height="12"
                        rx="2"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1"
                      />
                      <rect x="5" y="5" width="6" height="6" rx="1" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

const DEFAULT_MIN_TRANSFORMS = 2
const DEFAULT_MAX_TRANSFORMS = 5
const DEFAULT_MIN_VARIATIONS = 1
const DEFAULT_MAX_VARIATIONS = 3

export function createLogoFaviconGenerator(
  _flameDescriptor: FlameDescriptor,
  _selectedPalette: () => Palette | undefined,
  history: ChangeHistory<FlameDescriptor>,
) {
  const requestModal = useRequestModal()

  function handleCopyHistoryImage(entry: HistoryEntry) {
    const img = new Image()
    img.onload = async () => {
      const c = document.createElement('canvas')
      c.width = 256
      c.height = 256
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0, 256, 256)
      const blob = await new Promise<Blob | null>((r) => {
        c.toBlob(r, 'image/png')
      })
      if (!blob) return
      await window.navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ])
    }
    img.src = entry.thumbnail
  }

  function handleDownloadHistoryPng(entry: HistoryEntry) {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = 512
      c.height = 512
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0, 512, 512)
      c.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'logo.png'
        a.click()
        URL.revokeObjectURL(url)
      }, 'image/png')
    }
    img.src = entry.thumbnail
  }

  function handleDownloadHistoryIco(entry: HistoryEntry) {
    const img = new Image()
    img.onload = async () => {
      const c = document.createElement('canvas')
      c.width = 256
      c.height = 256
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0, 256, 256)
      const pngBlob = await new Promise<Blob | null>((r) => {
        c.toBlob(r, 'image/png')
      })
      if (!pngBlob) return
      const pngBytes = new Uint8Array(await pngBlob.arrayBuffer())
      const frames = await Promise.all(
        ICO_SIZES.map(async (size) => {
          const img2 = new Image()
          const pngPromise = new Promise<Uint8Array>((resolve) => {
            img2.onload = () => {
              const c2 = document.createElement('canvas')
              c2.width = size
              c2.height = size
              const ctx2 = c2.getContext('2d')!
              ctx2.drawImage(img2, 0, 0, size, size)
              c2.toBlob((b) => {
                if (!b) {
                  resolve(new Uint8Array(0))
                  return
                }
                void b.arrayBuffer().then((buf) => {
                  resolve(new Uint8Array(buf))
                })
              }, 'image/png')
            }
          })
          img2.src = URL.createObjectURL(
            new Blob([pngBytes], { type: 'image/png' }),
          )
          const result = await pngPromise
          return { width: size, height: size, png: result }
        }),
      )
      const icoBlob = encodeIco(frames)
      const url = URL.createObjectURL(icoBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'favicon.ico'
      a.click()
      URL.revokeObjectURL(url)
    }
    img.src = entry.thumbnail
  }

  async function showLogoFaviconGenerator() {
    const [strength, setStrength] = persistentSignal('logo/strength', 0.75)
    const [minTransforms, setMinTransforms] = persistentSignal(
      'logo/min-transforms',
      DEFAULT_MIN_TRANSFORMS,
    )
    const [maxTransforms, setMaxTransforms] = persistentSignal(
      'logo/max-transforms',
      DEFAULT_MAX_TRANSFORMS,
    )
    const [minVariations, setMinVariations] = persistentSignal(
      'logo/min-variations',
      DEFAULT_MIN_VARIATIONS,
    )
    const [maxVariations, setMaxVariations] = persistentSignal(
      'logo/max-variations',
      DEFAULT_MAX_VARIATIONS,
    )
    const [includeBackground, setIncludeBackground] = persistentSignal(
      'logo/include-background',
      true,
    )
    const [resolution, setResolution] = persistentSignal('logo/resolution', 256)
    const [quality, setQuality] = persistentSignal('logo/quality', 0.98)
    const [selectedVariations, setSelectedVariations] = persistentSignal(
      'logo/selected-variations',
      new Set<TransformVariationType>([...variationTypes]),
      {
        serialize: (s) => [...s],
        deserialize: (a) => new Set(a),
      },
    )
    const [cameraZoom, setCameraZoom] = createSignal(1)
    const [cameraPosition, setCameraPosition] = createSignal<v2f>(vec2f(0, 0))
    const [renderSettingsExpanded, setRenderSettingsExpanded] =
      persistentSignal('logo/render-settings-expanded', false)
    const [randomizeSkipIters, setRandomizeSkipIters] = persistentSignal(
      'logo/randomize-skipIters',
      false,
    )
    const [randomizeExposure, setRandomizeExposure] = persistentSignal(
      'logo/randomize-exposure',
      false,
    )
    const [randomizeContrast, setRandomizeContrast] = persistentSignal(
      'logo/randomize-contrast',
      false,
    )
    const [randomizeGamma, setRandomizeGamma] = persistentSignal(
      'logo/randomize-gamma',
      false,
    )
    const [randomizeHighlightPower, setRandomizeHighlightPower] =
      persistentSignal('logo/randomize-highlightPower', false)
    const [randomizeVibrancy, setRandomizeVibrancy] = persistentSignal(
      'logo/randomize-vibrancy',
      false,
    )
    const [canvasWidth, setCanvasWidth] = persistentSignal(
      'logo/canvas-width',
      256,
    )
    const [canvasHeight, setCanvasHeight] = persistentSignal(
      'logo/canvas-height',
      256,
    )
    const [aspectRatioLocked, setAspectRatioLocked] = persistentSignal(
      'logo/aspect-ratio-locked',
      true,
    )
    const [historyEntries, setHistoryEntries] = createSignal<HistoryEntry[]>([])
    void loadHistoryEntries(MAX_HISTORY).then(setHistoryEntries)
    const [historyExpanded, setHistoryExpanded] = persistentSignal(
      'logo/history-expanded',
      false,
    )
    const [selectedEntryTimestamp, setSelectedEntryTimestamp] =
      createSignal<number>(0)
    const [isGenerating, setIsGenerating] = createSignal(false)

    const [flame, setFlame] = createStore<FlameDescriptor>(
      deepClone(_flameDescriptor),
    )

    const renderSettings = () => flame.renderSettings

    function handleLoadHistory(entry: HistoryEntry) {
      setFlame(reconcile(deepClone(entry.flame)))
      setCameraZoom(1)
      setCameraPosition(vec2f(0, 0))
      setSelectedEntryTimestamp(entry.timestamp)
    }

    function handleClearHistory() {
      void clearHistory().then(() => setHistoryEntries([]))
    }

    async function handleGenerate() {
      if (isGenerating()) return
      setIsGenerating(true)
      try {
        setSelectedEntryTimestamp(0)
        // Save current flame to history before generating new one
        const prevThumb = await captureThumbnail(HISTORY_THUMBNAIL_SIZE)
        if (prevThumb !== null) {
          const entry: HistoryEntry = {
            flame: deepClone(flame),
            thumbnail: prevThumb,
            timestamp: Date.now(),
          }
          void addHistoryEntry(entry, MAX_HISTORY).then(setHistoryEntries)
        }

        const config: GenerateRandomFlameConfig = {
          strength: strength(),
          minTransforms: minTransforms(),
          maxTransforms: maxTransforms(),
          minVariations: minVariations(),
          maxVariations: maxVariations(),
          allowedVariations: [...selectedVariations()],
        }
        const prevRs = { ...flame.renderSettings }
        const newFlame = generateRandomFlame(config)
        const rs = newFlame.renderSettings
        if (randomizeSkipIters()) {
          rs.skipIters = RENDER_SETTING_RANGES.skipIters()
        } else {
          rs.skipIters = prevRs.skipIters
        }
        if (randomizeExposure()) {
          rs.exposure = RENDER_SETTING_RANGES.exposure()
        } else {
          rs.exposure = prevRs.exposure
        }
        if (randomizeContrast()) {
          rs.contrast = RENDER_SETTING_RANGES.contrast()
        } else {
          rs.contrast = prevRs.contrast
        }
        if (randomizeGamma()) {
          rs.gamma = RENDER_SETTING_RANGES.gamma()
        } else {
          rs.gamma = prevRs.gamma
        }
        if (randomizeHighlightPower()) {
          rs.highlightPower = RENDER_SETTING_RANGES.highlightPower()
        } else {
          rs.highlightPower = prevRs.highlightPower
        }
        if (randomizeVibrancy()) {
          rs.vibrancy = RENDER_SETTING_RANGES.vibrancy()
        } else {
          rs.vibrancy = prevRs.vibrancy
        }
        setFlame(reconcile(deepClone(newFlame)))
        setCameraZoom(1)
        setCameraPosition(vec2f(0, 0))
      } finally {
        setIsGenerating(false)
      }
    }

    function handleDownloadPng() {
      const canvas = document.querySelector<HTMLCanvasElement>(
        `.${ui.previewCanvas} canvas`,
      )
      if (canvas === null) return
      canvas.toBlob((blob) => {
        if (blob === null) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'logo.png'
        a.click()
        URL.revokeObjectURL(url)
      }, 'image/png')
    }

    function handleDownloadIco() {
      const canvas = document.querySelector<HTMLCanvasElement>(
        `.${ui.previewCanvas} canvas`,
      )
      if (canvas === null) return
      canvas.toBlob(async (blob) => {
        if (blob === null) return
        const pngBytes = new Uint8Array(await blob.arrayBuffer())
        const frames = await Promise.all(
          ICO_SIZES.map(async (size) => {
            const img = new Image()
            const pngPromise = new Promise<Uint8Array>((resolve) => {
              img.onload = () => {
                const c = document.createElement('canvas')
                c.width = size
                c.height = size
                const ctx = c.getContext('2d')!
                ctx.drawImage(img, 0, 0, size, size)
                c.toBlob((b) => {
                  if (b === null) {
                    resolve(new Uint8Array(0))
                    return
                  }
                  void b.arrayBuffer().then((buf) => {
                    resolve(new Uint8Array(buf))
                  })
                }, 'image/png')
              }
            })
            img.src = URL.createObjectURL(
              new Blob([pngBytes], { type: 'image/png' }),
            )
            const result = await pngPromise
            return { width: size, height: size, png: result }
          }),
        )
        const icoBlob = encodeIco(frames)
        const url = URL.createObjectURL(icoBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'favicon.ico'
        a.click()
        URL.revokeObjectURL(url)
      }, 'image/png')
    }

    await requestModal({
      class: ui.container,
      content: ({ respond }) => (
        <LogoDialog
          flame={flame}
          isGenerating={isGenerating()}
          onGenerate={handleGenerate}
          onLoadIntoMainView={() => {
            history.replace(deepClone(flame))
            respond()
          }}
          onDownloadPng={handleDownloadPng}
          onDownloadIco={handleDownloadIco}
          onCancel={() => {
            respond()
          }}
          strength={strength()}
          onStrengthChange={setStrength}
          minTransforms={minTransforms()}
          maxTransforms={maxTransforms()}
          onMinTransformsChange={setMinTransforms}
          onMaxTransformsChange={setMaxTransforms}
          minVariations={minVariations()}
          maxVariations={maxVariations()}
          onMinVariationsChange={setMinVariations}
          onMaxVariationsChange={setMaxVariations}
          includeBackground={includeBackground()}
          onIncludeBackgroundChange={setIncludeBackground}
          resolution={resolution()}
          onResolutionChange={setResolution}
          quality={quality()}
          onQualityChange={setQuality}
          selectedVariations={selectedVariations()}
          onToggleVariation={(t) => {
            setSelectedVariations((prev) => {
              const next = new Set(prev)
              if (next.has(t)) {
                if (next.size <= 2) return prev
                next.delete(t)
              } else {
                next.add(t)
              }
              return next
            })
          }}
          onSelectAllVariations={() =>
            setSelectedVariations(new Set([...variationTypes]))
          }
          onDeselectAllVariations={() => {
            const arr = [...variationTypes]
            setSelectedVariations(new Set(arr.slice(0, 2)))
          }}
          cameraZoom={[cameraZoom, setCameraZoom]}
          cameraPosition={[cameraPosition, setCameraPosition]}
          renderSettingsExpanded={renderSettingsExpanded()}
          onToggleRenderSettings={() => setRenderSettingsExpanded((p) => !p)}
          skipIters={renderSettings().skipIters}
          onSkipItersChange={(v) => {
            setFlame('renderSettings', 'skipIters', v)
          }}
          exposure={renderSettings().exposure}
          onExposureChange={(v) => {
            setFlame('renderSettings', 'exposure', v)
          }}
          contrast={renderSettings().contrast}
          onContrastChange={(v) => {
            setFlame('renderSettings', 'contrast', v)
          }}
          gamma={renderSettings().gamma}
          onGammaChange={(v) => {
            setFlame('renderSettings', 'gamma', v)
          }}
          highlightPower={renderSettings().highlightPower}
          onHighlightPowerChange={(v) => {
            setFlame('renderSettings', 'highlightPower', v)
          }}
          vibrancy={renderSettings().vibrancy}
          onVibrancyChange={(v) => {
            setFlame('renderSettings', 'vibrancy', v)
          }}
          randomizeSkipIters={randomizeSkipIters()}
          onRandomizeSkipItersChange={setRandomizeSkipIters}
          randomizeExposure={randomizeExposure()}
          onRandomizeExposureChange={setRandomizeExposure}
          randomizeContrast={randomizeContrast()}
          onRandomizeContrastChange={setRandomizeContrast}
          randomizeGamma={randomizeGamma()}
          onRandomizeGammaChange={setRandomizeGamma}
          randomizeHighlightPower={randomizeHighlightPower()}
          onRandomizeHighlightPowerChange={setRandomizeHighlightPower}
          randomizeVibrancy={randomizeVibrancy()}
          onRandomizeVibrancyChange={setRandomizeVibrancy}
          canvasWidth={canvasWidth()}
          onCanvasWidthChange={setCanvasWidth}
          canvasHeight={canvasHeight()}
          onCanvasHeightChange={setCanvasHeight}
          aspectRatioLocked={aspectRatioLocked()}
          onAspectRatioToggle={() => setAspectRatioLocked((p) => !p)}
          historyEntries={historyEntries()}
          historyExpanded={historyExpanded()}
          onToggleHistory={() => setHistoryExpanded((p) => !p)}
          onLoadHistory={handleLoadHistory}
          onClearHistory={handleClearHistory}
          onCopyHistoryImage={handleCopyHistoryImage}
          onDownloadHistoryPng={handleDownloadHistoryPng}
          onDownloadHistoryIco={handleDownloadHistoryIco}
          selectedEntryTimestamp={selectedEntryTimestamp()}
        />
      ),
    })
  }

  return { showLogoFaviconGenerator }
}
