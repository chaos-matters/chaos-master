import { createEffect, createSignal, For, Show } from 'solid-js'
import { Button } from '@/components/Button/Button'
import { Checkbox } from '@/components/Checkbox/Checkbox'
import { CollapsibleCard } from '@/components/CollapsibleCard/CollapsibleCard'
import { VariationPalette } from '@/components/LogoFaviconGenerator/VariationPalette'
import { Slider } from '@/components/Sliders/Slider'
import { variationTypes } from '@/flame/variations'
import { variationTypes3D } from '@/flame/variations3D'
import { persistentSignal } from '@/utils/persistentSignal'
import ui from './FlameRandomizerCard.module.css'
import type { GenerateRandomFlameConfig } from '@/flame/randomize'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TransformVariationType } from '@/flame/variations'
import type { TransformVariationType3D } from '@/flame/variations3D'
import type { RandomizerHistoryEntry } from '@/utils/randomizerHistoryDB'

export interface FlameRandomizerCardProps {
  flame: FlameDescriptor
  historyEntries: RandomizerHistoryEntry[]
  selectedTimestamp: number
  onGenerateFlame: (
    config: GenerateRandomFlameConfig,
    randomizeSettings: {
      skipIters: boolean
      exposure: boolean
      contrast: boolean
      gamma: boolean
      highlightPower: boolean
      vibrancy: boolean
    },
  ) => void
  onLoadHistory: (entry: RandomizerHistoryEntry) => void
  onClearHistory: () => void
  onRandomizeAnimation: (presetIds: string[]) => void
  onUpdateRenderSettings: (
    settings: Partial<FlameDescriptor['renderSettings']>,
  ) => void
}

function numberOptions(min: number, max: number) {
  const opts: number[] = []
  for (let i = min; i <= max; i++) opts.push(i)
  return opts
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
      <svg viewBox="0 0 16 16" fill="currentColor">
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

export function FlameRandomizerCard(props: FlameRandomizerCardProps) {
  const is3D = () => props.flame.renderSettings.dimensions === 3
  const transformOptions = () => numberOptions(1, 10)
  const variationOptions = () => numberOptions(1, 5)

  // Local settings signals
  const [strength, setStrength] = createSignal(0.5)
  const [minTransforms, setMinTransforms] = createSignal(2)
  const [maxTransforms, setMaxTransforms] = createSignal(4)
  const [minVariations, setMinVariations] = createSignal(1)
  const [maxVariations, setMaxVariations] = createSignal(2)

  // Track selected variations
  const [selectedVariations, setSelectedVariations] = createSignal<
    Set<TransformVariationType | TransformVariationType3D>
  >(new Set([...variationTypes]))

  // Keep variations selection set updated when changing between 2D and 3D
  createEffect(() => {
    const list = is3D() ? [...variationTypes3D] : [...variationTypes]
    setSelectedVariations(new Set(list))
  })

  const handleToggleVariation = (
    type: TransformVariationType | TransformVariationType3D,
  ) => {
    setSelectedVariations((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const handleSelectAllVariations = () => {
    const list = is3D() ? variationTypes3D : variationTypes
    setSelectedVariations(new Set([...list]))
  }

  const handleDeselectAllVariations = () => {
    setSelectedVariations(new Set())
  }

  // Animation Preset Signals
  const [animPan, setAnimPan] = createSignal(true)
  const [animZoom, setAnimZoom] = createSignal(true)
  const [animRot, setAnimRot] = createSignal(false)
  const [animColor, setAnimColor] = createSignal(true)
  const [animVib, setAnimVib] = createSignal(false)
  const [animOrbit, setAnimOrbit] = createSignal(true)
  const [animFT, setAnimFT] = createSignal(false)

  // Render settings randomizer signals
  const [renderSettingsExpanded, setRenderSettingsExpanded] =
    createSignal(false)
  const [randomizeSkipIters, setRandomizeSkipIters] = persistentSignal(
    'randomizer/randomize-skipIters',
    true,
  )
  const [randomizeExposure, setRandomizeExposure] = persistentSignal(
    'randomizer/randomize-exposure',
    true,
  )
  const [randomizeContrast, setRandomizeContrast] = persistentSignal(
    'randomizer/randomize-contrast',
    true,
  )
  const [randomizeGamma, setRandomizeGamma] = persistentSignal(
    'randomizer/randomize-gamma',
    true,
  )
  const [randomizeHighlightPower, setRandomizeHighlightPower] =
    persistentSignal('randomizer/randomize-highlightPower', true)
  const [randomizeVibrancy, setRandomizeVibrancy] = persistentSignal(
    'randomizer/randomize-vibrancy',
    true,
  )

  const [historyExpanded, setHistoryExpanded] = createSignal(true)

  const handleGenerate = () => {
    const config: GenerateRandomFlameConfig = {
      strength: strength(),
      minTransforms: minTransforms(),
      maxTransforms: maxTransforms(),
      minVariations: minVariations(),
      maxVariations: maxVariations(),
      allowedVariations: [...selectedVariations()] as (
        | TransformVariationType
        | TransformVariationType3D
      )[],
      dimensions: props.flame.renderSettings.dimensions,
    }
    props.onGenerateFlame(config, {
      skipIters: randomizeSkipIters(),
      exposure: randomizeExposure(),
      contrast: randomizeContrast(),
      gamma: randomizeGamma(),
      highlightPower: randomizeHighlightPower(),
      vibrancy: randomizeVibrancy(),
    })
  }

  const handleRandomizeAnimation = () => {
    const presetIds: string[] = []
    if (animPan()) presetIds.push('pan')
    if (animZoom()) presetIds.push('zoom')
    if (animRot()) presetIds.push('rot')
    if (animColor()) presetIds.push('color')
    if (animVib()) presetIds.push('vibrancy')
    if (is3D() && animOrbit()) presetIds.push('orbit')
    if (animFT()) presetIds.push('finalTransform')

    props.onRandomizeAnimation(presetIds)
  }

  const [paletteExpanded, setPaletteExpanded] = createSignal(false)

  return (
    <CollapsibleCard title="Flame Randomizer" defaultOpen={false}>
      <div class={ui.cardBody}>
        {/* Settings Panel */}
        <div class={ui.settingsSection}>
          <div class={ui.field}>
            <span class={ui.fieldLabel}>Randomness</span>
            <div class={ui.sliderField}>
              <Slider
                value={strength()}
                min={0}
                max={1}
                step={0.01}
                onInput={setStrength}
                formatValue={(v) => `${Math.round(v * 100)}%`}
              />
            </div>
          </div>

          <div class={ui.fieldRow}>
            <label class={ui.field}>
              <span class={ui.fieldLabel}>Transf. Min</span>
              <select
                class={ui.select}
                value={minTransforms()}
                onChange={(e) => {
                  const v = Number(e.currentTarget.value)
                  setMinTransforms(v)
                  if (v > maxTransforms()) setMaxTransforms(v)
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
                value={maxTransforms()}
                onChange={(e) => {
                  const v = Number(e.currentTarget.value)
                  setMaxTransforms(v)
                  if (v < minTransforms()) setMinTransforms(v)
                }}
              >
                <For each={transformOptions()}>
                  {(n) => <option value={n}>{n}</option>}
                </For>
              </select>
            </label>
          </div>

          <div class={ui.fieldRow}>
            <label class={ui.field}>
              <span class={ui.fieldLabel}>Var. Min</span>
              <select
                class={ui.select}
                value={minVariations()}
                onChange={(e) => {
                  const v = Number(e.currentTarget.value)
                  setMinVariations(v)
                  if (v > maxVariations()) setMaxVariations(v)
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
                value={maxVariations()}
                onChange={(e) => {
                  const v = Number(e.currentTarget.value)
                  setMaxVariations(v)
                  if (v < minVariations()) setMinVariations(v)
                }}
              >
                <For each={variationOptions()}>
                  {(n) => <option value={n}>{n}</option>}
                </For>
              </select>
            </label>
          </div>

          {/* Collapsible Render Settings */}
          <div class={ui.paletteWrapper}>
            <button
              type="button"
              class={ui.paletteHeader}
              onClick={() =>
                setRenderSettingsExpanded(!renderSettingsExpanded())
              }
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class={ui.chevron}
                classList={{
                  [ui.chevronExpanded as string]: renderSettingsExpanded(),
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <span>Render Settings</span>
            </button>
            <Show when={renderSettingsExpanded()}>
              <div class={ui.renderGrid}>
                <label class={ui.renderField}>
                  <div class={ui.renderLabelRow}>
                    <span class={ui.renderLabel}>Skip Iters</span>
                    <RandomizeToggleButton
                      enabled={randomizeSkipIters()}
                      onChange={setRandomizeSkipIters}
                    />
                  </div>
                  <Slider
                    value={props.flame.renderSettings.skipIters}
                    min={0}
                    max={30}
                    step={1}
                    onInput={(v) => {
                      props.onUpdateRenderSettings({ skipIters: v })
                    }}
                  />
                </label>
                <label class={ui.renderField}>
                  <div class={ui.renderLabelRow}>
                    <span class={ui.renderLabel}>Exposure</span>
                    <RandomizeToggleButton
                      enabled={randomizeExposure()}
                      onChange={setRandomizeExposure}
                    />
                  </div>
                  <Slider
                    value={props.flame.renderSettings.exposure}
                    min={-4}
                    max={4}
                    step={0.01}
                    onInput={(v) => {
                      props.onUpdateRenderSettings({ exposure: v })
                    }}
                  />
                </label>
                <label class={ui.renderField}>
                  <div class={ui.renderLabelRow}>
                    <span class={ui.renderLabel}>Contrast</span>
                    <RandomizeToggleButton
                      enabled={randomizeContrast()}
                      onChange={setRandomizeContrast}
                    />
                  </div>
                  <Slider
                    value={props.flame.renderSettings.contrast}
                    min={0.1}
                    max={10}
                    step={0.01}
                    onInput={(v) => {
                      props.onUpdateRenderSettings({ contrast: v })
                    }}
                  />
                </label>
                <label class={ui.renderField}>
                  <div class={ui.renderLabelRow}>
                    <span class={ui.renderLabel}>Gamma</span>
                    <RandomizeToggleButton
                      enabled={randomizeGamma()}
                      onChange={setRandomizeGamma}
                    />
                  </div>
                  <Slider
                    value={props.flame.renderSettings.gamma}
                    min={0.2}
                    max={5}
                    step={0.01}
                    onInput={(v) => {
                      props.onUpdateRenderSettings({ gamma: v })
                    }}
                  />
                </label>
                <label class={ui.renderField}>
                  <div class={ui.renderLabelRow}>
                    <span class={ui.renderLabel}>Highlight</span>
                    <RandomizeToggleButton
                      enabled={randomizeHighlightPower()}
                      onChange={setRandomizeHighlightPower}
                    />
                  </div>
                  <Slider
                    value={props.flame.renderSettings.highlightPower}
                    min={0}
                    max={1}
                    step={0.01}
                    onInput={(v) => {
                      props.onUpdateRenderSettings({ highlightPower: v })
                    }}
                  />
                </label>
                <label class={ui.renderField}>
                  <div class={ui.renderLabelRow}>
                    <span class={ui.renderLabel}>Vibrancy</span>
                    <RandomizeToggleButton
                      enabled={randomizeVibrancy()}
                      onChange={setRandomizeVibrancy}
                    />
                  </div>
                  <Slider
                    value={props.flame.renderSettings.vibrancy}
                    min={0}
                    max={1}
                    step={0.01}
                    onInput={(v) => {
                      props.onUpdateRenderSettings({ vibrancy: v })
                    }}
                  />
                </label>
              </div>
            </Show>
          </div>

          {/* Collapsible Variation Palette */}
          <div class={ui.paletteWrapper}>
            <button
              type="button"
              class={ui.paletteHeader}
              onClick={() => setPaletteExpanded(!paletteExpanded())}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class={ui.chevron}
                classList={{
                  [ui.chevronExpanded as string]: paletteExpanded(),
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <span>Allowed Variations ({selectedVariations().size})</span>
            </button>
            <Show when={paletteExpanded()}>
              <div class={ui.paletteContainer}>
                <VariationPalette
                  allVariations={is3D() ? variationTypes3D : variationTypes}
                  selected={selectedVariations()}
                  onToggle={handleToggleVariation}
                  onSelectAll={handleSelectAllVariations}
                  onDeselectAll={handleDeselectAllVariations}
                />
              </div>
            </Show>
          </div>

          <Button class={ui.primaryButton} onClick={handleGenerate}>
            <svg
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
              fill="none"
              class={ui.btnIcon}
            >
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
            Generate Random Flame
          </Button>
        </div>

        {/* Divider */}
        <div class={ui.divider} />

        {/* Animation Presets Section */}
        <div class={ui.animSection}>
          <span class={ui.sectionTitle}>Animation Randomizer</span>
          <div class={ui.presetsGrid}>
            <label class={ui.checkboxField}>
              <Checkbox checked={animPan()} onChange={setAnimPan} />
              <span>Camera Pan</span>
            </label>
            <label class={ui.checkboxField}>
              <Checkbox checked={animZoom()} onChange={setAnimZoom} />
              <span>Camera Zoom</span>
            </label>
            <label class={ui.checkboxField}>
              <Checkbox checked={animRot()} onChange={setAnimRot} />
              <span>Camera Spin</span>
            </label>
            <label class={ui.checkboxField}>
              <Checkbox checked={animColor()} onChange={setAnimColor} />
              <span>Color Cycle</span>
            </label>
            <label class={ui.checkboxField}>
              <Checkbox checked={animVib()} onChange={setAnimVib} />
              <span>Vibrancy Pulse</span>
            </label>
            <Show when={is3D()}>
              <label class={ui.checkboxField}>
                <Checkbox checked={animOrbit()} onChange={setAnimOrbit} />
                <span>3D Orbit</span>
              </label>
            </Show>
            <label class={ui.checkboxField}>
              <Checkbox checked={animFT()} onChange={setAnimFT} />
              <span>Final Transf. Spin</span>
            </label>
          </div>
          <Button class={ui.secondaryButton} onClick={handleRandomizeAnimation}>
            <svg
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
              fill="none"
              class={ui.btnIcon}
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Randomize Animation
          </Button>
        </div>

        {/* Recent History Gallery */}
        <Show when={props.historyEntries.length > 0}>
          <div class={ui.divider} />
          <div class={ui.historySection}>
            <div class={ui.historyHeader}>
              <button
                type="button"
                class={ui.historyCollapsibleHeader}
                onClick={() => setHistoryExpanded(!historyExpanded())}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class={ui.chevron}
                  classList={{
                    [ui.chevronExpanded as string]: historyExpanded(),
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                <span>Recent History ({props.historyEntries.length})</span>
              </button>
              <button
                type="button"
                class={ui.clearBtn}
                onClick={props.onClearHistory}
                title="Clear history"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
            <Show when={historyExpanded()}>
              <div class={ui.historyGrid}>
                <For each={props.historyEntries}>
                  {(entry) => (
                    <button
                      type="button"
                      class={ui.historyThumbBtn}
                      classList={{
                        [ui.historyThumbBtnSelected as string]:
                          props.selectedTimestamp === entry.timestamp,
                      }}
                      onClick={() => {
                        props.onLoadHistory(entry)
                      }}
                      title="Load flame state"
                    >
                      <img
                        src={entry.thumbnail}
                        alt="History flame thumbnail"
                        class={ui.historyThumb}
                      />
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </CollapsibleCard>
  )
}
