import { createEffect, createSignal, For, Show } from 'solid-js'
import { Button } from '@/components/Button/Button'
import { Checkbox } from '@/components/Checkbox/Checkbox'
import { CollapsibleCard } from '@/components/CollapsibleCard/CollapsibleCard'
import { RangeSlider } from '@/components/Sliders/RangeSlider'
import { Slider } from '@/components/Sliders/Slider'
import { VariationMultiSelect } from '@/components/VariationMultiSelect/VariationMultiSelect'
import { MUTATION_PRESETS, MUTATION_RATE_DEFAULTS } from '@/flame/randomize'
import { categoryOf } from '@/flame/variationRegistry'
import { variationTypes } from '@/flame/variations'
import { variationTypes3D } from '@/flame/variations3D'
import { persistentSignal } from '@/utils/persistentSignal'
import ui from './FlameRandomizerCard.module.css'
import { RandomizerGallery } from './RandomizerGallery'
import type { GenerateRandomFlameConfig, MutateFlameOptions, MutationPresetName, } from '@/flame/randomize'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { Dims } from '@/flame/variationRegistry'
import type { TransformVariationType } from '@/flame/variations'
import type { TransformVariationType3D } from '@/flame/variations3D'
import type { HardwareTier } from '@/utils/hardwareTier'
import type { RandomizerHistoryEntry } from '@/utils/randomizerHistoryDB'

export interface FlameRandomizerCardProps {
  flame: FlameDescriptor
  historyEntries: RandomizerHistoryEntry[]
  selectedTimestamp: number
  /** True while a generate/mutate run is in flight — disables the buttons. */
  isBusy?: boolean
  onGenerateFlame: (
    config: GenerateRandomFlameConfig,
    randomizeSettings: {
      skipIters: boolean
      skipItersRange?: [number, number]
      exposure: boolean
      exposureRange?: [number, number]
      contrast: boolean
      contrastRange?: [number, number]
      gamma: boolean
      gammaRange?: [number, number]
      highlightPower: boolean
      highlightPowerRange?: [number, number]
      vibrancy: boolean
      vibrancyRange?: [number, number]
    },
    recordHistory: boolean,
  ) => void
  onMutateFlame: (
    config: GenerateRandomFlameConfig,
    randomizeSettings: {
      skipIters: boolean
      skipItersRange?: [number, number]
      exposure: boolean
      exposureRange?: [number, number]
      contrast: boolean
      contrastRange?: [number, number]
      gamma: boolean
      gammaRange?: [number, number]
      highlightPower: boolean
      highlightPowerRange?: [number, number]
      vibrancy: boolean
      vibrancyRange?: [number, number]
    },
    mutationSettings: MutateFlameOptions,
    recordHistory: boolean,
  ) => void
  onLoadHistory: (entry: RandomizerHistoryEntry) => void
  onClearHistory: () => void
  onRandomizeAnimation: (presetIds: string[], clearFirst: boolean) => void
  onSmartAnimation: (clearFirst: boolean) => void
  onUpdateRenderSettings: (
    settings: Partial<FlameDescriptor['renderSettings']>,
  ) => void
  /** Apply a flame chosen from the preview gallery (replaces the active flame). */
  onApplyCandidate: (flame: FlameDescriptor) => void
  hardwareTier?: HardwareTier | null
  /** Controlled card open state (see CollapsibleCard). */
  open?: boolean
  onToggleOpen?: () => void
  /** Bumping this expands the Animation Settings section (Timeline "Animate"
   *  button). The initial value is ignored. */
  expandAnimationEpoch?: number
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

/**
 * Categories selected by default in the randomizer — General + Blur only.
 * Everything else (pre/post/crop/cut/dc/symmetry/3d/...) starts deselected.
 */
function defaultSelectedVariations(
  dims: Dims,
): Set<TransformVariationType | TransformVariationType3D> {
  const list = dims === 3 ? variationTypes3D : variationTypes
  return new Set(
    list.filter((type) => {
      const category = categoryOf(dims, type)
      return category === 'general' || category === 'blur'
    }),
  )
}

export function FlameRandomizerCard(props: FlameRandomizerCardProps) {
  const is3D = () => props.flame.renderSettings.dimensions === 3

  // A single "active selection" across the whole card: either a Preview Gallery
  // cell or a Recent History entry is highlighted, never both.
  const [selectionOwner, setSelectionOwner] = createSignal<
    'gallery' | 'history' | null
  >(null)

  // Local settings signals
  const [strength, setStrength] = createSignal(0.5)
  const [minTransforms, setMinTransforms] = createSignal(2)
  const [maxTransforms, setMaxTransforms] = createSignal(4)
  const [minVariations, setMinVariations] = createSignal(1)
  const [maxVariations, setMaxVariations] = createSignal(2)

  const transformsValue = () =>
    [minTransforms(), maxTransforms()] as [number, number]
  const handleTransformsInput = (val: [number, number]) => {
    setMinTransforms(val[0])
    setMaxTransforms(val[1])
  }

  const variationsValue = () =>
    [minVariations(), maxVariations()] as [number, number]
  const handleVariationsInput = (val: [number, number]) => {
    setMinVariations(val[0])
    setMaxVariations(val[1])
  }

  // Track selected variations (default: General + Blur groups only).
  const [selectedVariations, setSelectedVariations] = createSignal<
    Set<TransformVariationType | TransformVariationType3D>
  >(defaultSelectedVariations(is3D() ? 3 : 2))

  // Reset to the default selection when switching between 2D and 3D.
  createEffect(() => {
    setSelectedVariations(defaultSelectedVariations(is3D() ? 3 : 2))
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
    setSelectedVariations(
      new Set<TransformVariationType | TransformVariationType3D>([...list]),
    )
  }

  const handleDeselectAllVariations = () => {
    setSelectedVariations(
      new Set<TransformVariationType | TransformVariationType3D>(),
    )
  }

  // Animation Preset Signals
  const [animPan, setAnimPan] = createSignal(true)
  const [animZoom, setAnimZoom] = createSignal(true)
  const [animRot, setAnimRot] = createSignal(false)
  const [animColor, setAnimColor] = createSignal(true)
  const [animTransformColor, setAnimTransformColor] = createSignal(false)
  const [animVib, setAnimVib] = createSignal(false)
  const [animOrbit, setAnimOrbit] = createSignal(true)
  const [animFT, setAnimFT] = createSignal(false)
  // When on (default), Randomize/Smart Animate wipe all tracks first (the
  // original behaviour); turn off to layer onto existing keyframes (re-running
  // overwrites the same frames but preserves hand-made ones on other paths).
  const [animClearFirst, setAnimClearFirst] = createSignal(true)

  // Render settings randomizer signals
  const [renderSettingsExpanded, setRenderSettingsExpanded] =
    createSignal(false)
  const [randomizeSkipIters, setRandomizeSkipIters] = persistentSignal(
    'randomizer/randomize-skipIters',
    true,
  )
  const [skipItersRange, setSkipItersRange] = persistentSignal<
    [number, number]
  >('randomizer/range-skipIters', [5, 30])

  const [randomizeExposure, setRandomizeExposure] = persistentSignal(
    'randomizer/randomize-exposure',
    true,
  )
  const [exposureRange, setExposureRange] = persistentSignal<[number, number]>(
    'randomizer/range-exposure',
    [-2, 2],
  )

  const [randomizeContrast, setRandomizeContrast] = persistentSignal(
    'randomizer/randomize-contrast',
    true,
  )
  const [contrastRange, setContrastRange] = persistentSignal<[number, number]>(
    'randomizer/range-contrast',
    [0.5, 4.0],
  )

  const [randomizeGamma, setRandomizeGamma] = persistentSignal(
    'randomizer/randomize-gamma',
    true,
  )
  const [gammaRange, setGammaRange] = persistentSignal<[number, number]>(
    'randomizer/range-gamma',
    [1.0, 3.5],
  )

  const [randomizeHighlightPower, setRandomizeHighlightPower] =
    persistentSignal('randomizer/randomize-highlightPower', true)
  const [highlightPowerRange, setHighlightPowerRange] = persistentSignal<
    [number, number]
  >('randomizer/range-highlightPower', [0.1, 0.9])

  const [randomizeVibrancy, setRandomizeVibrancy] = persistentSignal(
    'randomizer/randomize-vibrancy',
    true,
  )
  const [vibrancyRange, setVibrancyRange] = persistentSignal<[number, number]>(
    'randomizer/range-vibrancy',
    [0.2, 0.8],
  )

  // Mutation Settings
  const [mutationSettingsExpanded, setMutationSettingsExpanded] =
    createSignal(false)
  const [mutateAffine, setMutateAffine] = persistentSignal(
    'randomizer/mutate-affine',
    true,
  )
  const [affineMode, setAffineMode] = persistentSignal<'smart' | 'full'>(
    'randomizer/affine-mode',
    'smart',
  )
  const [mutateVariations, setMutateVariations] = persistentSignal<
    'modify' | 'all' | 'none'
  >('randomizer/mutate-variations', 'all')
  const [mutateColors, setMutateColors] = persistentSignal(
    'randomizer/mutate-colors',
    true,
  )
  // Mutation Lab — fine-grained rate controls persisted to localStorage.
  const [mutationPreset, setMutationPreset] = persistentSignal<
    MutationPresetName | 'Custom'
  >('randomizer/mutation-preset', 'Moderate')
  const [affineMutationRate, setAffineMutationRate] = persistentSignal<number>(
    'randomizer/mutation-affineRate',
    MUTATION_RATE_DEFAULTS.affineMutationRate,
  )
  const [colorMutationRate, setColorMutationRate] = persistentSignal<number>(
    'randomizer/mutation-colorRate',
    MUTATION_RATE_DEFAULTS.colorMutationRate,
  )
  const [variationWeightRate, setVariationWeightRate] =
    persistentSignal<number>(
      'randomizer/mutation-weightRate',
      MUTATION_RATE_DEFAULTS.variationWeightRate,
    )
  const [variationSwapChance, setVariationSwapChance] =
    persistentSignal<number>(
      'randomizer/mutation-swapChance',
      MUTATION_RATE_DEFAULTS.variationSwapChance,
    )
  const [mutationAddChance, setMutationAddChance] = persistentSignal<number>(
    'randomizer/mutation-addChance',
    MUTATION_RATE_DEFAULTS.addTransformChance,
  )
  const [mutationRemoveChance, setMutationRemoveChance] =
    persistentSignal<number>(
      'randomizer/mutation-removeChance',
      MUTATION_RATE_DEFAULTS.removeTransformChance,
    )

  const [recordHistoryOnGenerate, setRecordHistoryOnGenerate] =
    persistentSignal('randomizer/record-history-generate', true)
  const [recordHistoryOnMutate, setRecordHistoryOnMutate] = persistentSignal(
    'randomizer/record-history-mutate',
    true,
  )

  /** Apply a preset, copying its values into the individual rate signals. */
  const applyMutationPreset = (name: MutationPresetName | 'Custom') => {
    setMutationPreset(name)
    if (name === 'Custom') return
    const p = MUTATION_PRESETS[name]
    setAffineMutationRate(p.affineMutationRate)
    setColorMutationRate(p.colorMutationRate)
    setVariationWeightRate(p.variationWeightRate)
    setVariationSwapChance(p.variationSwapChance)
    setMutationAddChance(p.addTransformChance)
    setMutationRemoveChance(p.removeTransformChance)
  }

  // When any individual slider changes, switch preset to 'Custom'.
  const markMutationCustom = () => {
    if (mutationPreset() !== 'Custom') setMutationPreset('Custom')
  }

  const [animationExpanded, setAnimationExpanded] = createSignal(false)
  const [historyExpanded, setHistoryExpanded] = createSignal(true)

  // Timeline "Animate" button: a bumped epoch forces the Animation Settings
  // section open (the card itself is opened via the controlled `open` prop).
  let isInitialAnimEpoch = true
  createEffect(() => {
    void props.expandAnimationEpoch
    if (isInitialAnimEpoch) {
      isInitialAnimEpoch = false
      return
    }
    setAnimationExpanded(true)
  })

  const buildConfig = (): GenerateRandomFlameConfig => ({
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
  })

  const buildMutationOptions = (): MutateFlameOptions => ({
    mutateAffine: mutateAffine(),
    affineMode: affineMode(),
    affineMutationRate: affineMutationRate(),
    mutateVariations: mutateVariations(),
    variationWeightRate: variationWeightRate(),
    variationSwapChance: variationSwapChance(),
    mutateColors: mutateColors(),
    colorMutationRate: colorMutationRate(),
    addTransformChance: mutationAddChance(),
    removeTransformChance: mutationRemoveChance(),
  })

  const handleGenerate = () => {
    setSelectionOwner(null)
    const config = buildConfig()
    props.onGenerateFlame(
      config,
      {
        skipIters: randomizeSkipIters(),
        skipItersRange: skipItersRange(),
        exposure: randomizeExposure(),
        exposureRange: exposureRange(),
        contrast: randomizeContrast(),
        contrastRange: contrastRange(),
        gamma: randomizeGamma(),
        gammaRange: gammaRange(),
        highlightPower: randomizeHighlightPower(),
        highlightPowerRange: highlightPowerRange(),
        vibrancy: randomizeVibrancy(),
        vibrancyRange: vibrancyRange(),
      },
      recordHistoryOnGenerate(),
    )
  }

  const handleMutate = () => {
    setSelectionOwner(null)
    const config = buildConfig()
    props.onMutateFlame(
      config,
      {
        skipIters: randomizeSkipIters(),
        skipItersRange: skipItersRange(),
        exposure: randomizeExposure(),
        exposureRange: exposureRange(),
        contrast: randomizeContrast(),
        contrastRange: contrastRange(),
        gamma: randomizeGamma(),
        gammaRange: gammaRange(),
        highlightPower: randomizeHighlightPower(),
        highlightPowerRange: highlightPowerRange(),
        vibrancy: randomizeVibrancy(),
        vibrancyRange: vibrancyRange(),
      },
      buildMutationOptions(),
      recordHistoryOnMutate(),
    )
  }

  const handleRandomizeAnimation = () => {
    const presetIds: string[] = []
    if (animPan()) presetIds.push('pan')
    if (animZoom()) presetIds.push('zoom')
    if (animRot()) presetIds.push('rot')
    if (animColor()) presetIds.push('color')
    if (animTransformColor()) presetIds.push('transformColor')
    if (animVib()) presetIds.push('vibrancy')
    if (is3D() && animOrbit()) presetIds.push('orbit')
    if (animFT()) presetIds.push('finalTransform')

    props.onRandomizeAnimation(presetIds, animClearFirst())
  }

  const handleSmartAnimation = () => {
    props.onSmartAnimation(animClearFirst())
  }

  const [paletteExpanded, setPaletteExpanded] = createSignal(false)
  const [galleryExpanded, setGalleryExpanded] = createSignal(false)

  return (
    <CollapsibleCard
      title="Flame Randomizer"
      defaultOpen={false}
      open={props.open}
      onToggleOpen={props.onToggleOpen}
    >
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

          <div class={ui.renderField}>
            <RangeSlider
              class={ui.wideRangeSlider}
              label="Transforms"
              value={transformsValue()}
              min={1}
              max={10}
              step={1}
              onInput={handleTransformsInput}
            />
          </div>

          <div class={ui.renderField}>
            <RangeSlider
              class={ui.wideRangeSlider}
              label="Variations per Transf."
              value={variationsValue()}
              min={1}
              max={10}
              step={1}
              onInput={handleVariationsInput}
            />
          </div>

          <label
            class={ui.checkboxField}
            style={{ 'margin-top': '4px', 'margin-bottom': '4px' }}
          >
            <Checkbox
              checked={recordHistoryOnGenerate()}
              onChange={setRecordHistoryOnGenerate}
            />
            <span>Save Previous to History</span>
          </label>

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
                <div class={ui.renderField}>
                  <div class={ui.renderLabelRow}>
                    <span class={ui.renderLabel}>
                      Skip Iters:{' '}
                      <span class={ui.valuePreview}>
                        {props.flame.renderSettings.skipIters}
                      </span>
                    </span>
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
                    showValue={false}
                    onInput={(v) => {
                      props.onUpdateRenderSettings({ skipIters: v })
                    }}
                  />
                  <Show when={randomizeSkipIters()}>
                    <RangeSlider
                      label="Range"
                      value={skipItersRange()}
                      min={0}
                      max={30}
                      step={1}
                      onInput={setSkipItersRange}
                    />
                  </Show>
                </div>
                <div class={ui.renderField}>
                  <div class={ui.renderLabelRow}>
                    <span class={ui.renderLabel}>
                      Exposure:{' '}
                      <span class={ui.valuePreview}>
                        {props.flame.renderSettings.exposure.toFixed(2)}
                      </span>
                    </span>
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
                    showValue={false}
                    onInput={(v) => {
                      props.onUpdateRenderSettings({ exposure: v })
                    }}
                  />
                  <Show when={randomizeExposure()}>
                    <RangeSlider
                      label="Range"
                      value={exposureRange()}
                      min={-4}
                      max={4}
                      step={0.01}
                      onInput={setExposureRange}
                    />
                  </Show>
                </div>
                <div class={ui.renderField}>
                  <div class={ui.renderLabelRow}>
                    <span class={ui.renderLabel}>
                      Contrast:{' '}
                      <span class={ui.valuePreview}>
                        {props.flame.renderSettings.contrast.toFixed(2)}
                      </span>
                    </span>
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
                    showValue={false}
                    onInput={(v) => {
                      props.onUpdateRenderSettings({ contrast: v })
                    }}
                  />
                  <Show when={randomizeContrast()}>
                    <RangeSlider
                      label="Range"
                      value={contrastRange()}
                      min={0.1}
                      max={10}
                      step={0.01}
                      onInput={setContrastRange}
                    />
                  </Show>
                </div>
                <div class={ui.renderField}>
                  <div class={ui.renderLabelRow}>
                    <span class={ui.renderLabel}>
                      Gamma:{' '}
                      <span class={ui.valuePreview}>
                        {props.flame.renderSettings.gamma.toFixed(2)}
                      </span>
                    </span>
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
                    showValue={false}
                    onInput={(v) => {
                      props.onUpdateRenderSettings({ gamma: v })
                    }}
                  />
                  <Show when={randomizeGamma()}>
                    <RangeSlider
                      label="Range"
                      value={gammaRange()}
                      min={0.2}
                      max={5}
                      step={0.01}
                      onInput={setGammaRange}
                    />
                  </Show>
                </div>
                <div class={ui.renderField}>
                  <div class={ui.renderLabelRow}>
                    <span class={ui.renderLabel}>
                      Highlight:{' '}
                      <span class={ui.valuePreview}>
                        {props.flame.renderSettings.highlightPower.toFixed(2)}
                      </span>
                    </span>
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
                    showValue={false}
                    onInput={(v) => {
                      props.onUpdateRenderSettings({ highlightPower: v })
                    }}
                  />
                  <Show when={randomizeHighlightPower()}>
                    <RangeSlider
                      label="Range"
                      value={highlightPowerRange()}
                      min={0}
                      max={1}
                      step={0.01}
                      onInput={setHighlightPowerRange}
                    />
                  </Show>
                </div>
                <div class={ui.renderField}>
                  <div class={ui.renderLabelRow}>
                    <span class={ui.renderLabel}>
                      Vibrancy:{' '}
                      <span class={ui.valuePreview}>
                        {props.flame.renderSettings.vibrancy.toFixed(2)}
                      </span>
                    </span>
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
                    showValue={false}
                    onInput={(v) => {
                      props.onUpdateRenderSettings({ vibrancy: v })
                    }}
                  />
                  <Show when={randomizeVibrancy()}>
                    <RangeSlider
                      label="Range"
                      value={vibrancyRange()}
                      min={0}
                      max={1}
                      step={0.01}
                      onInput={setVibrancyRange}
                    />
                  </Show>
                </div>
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
                <VariationMultiSelect
                  dims={is3D() ? 3 : 2}
                  allVariations={is3D() ? variationTypes3D : variationTypes}
                  selected={selectedVariations()}
                  onToggle={handleToggleVariation}
                  onSelectAll={handleSelectAllVariations}
                  onDeselectAll={handleDeselectAllVariations}
                />
              </div>
            </Show>
          </div>

          {/* Collapsible Mutation Settings */}
          <div class={ui.paletteWrapper}>
            <button
              type="button"
              class={ui.paletteHeader}
              onClick={() =>
                setMutationSettingsExpanded(!mutationSettingsExpanded())
              }
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class={ui.chevron}
                classList={{
                  [ui.chevronExpanded as string]: mutationSettingsExpanded(),
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <span>Mutation Lab</span>
            </button>
            <Show when={mutationSettingsExpanded()}>
              <div class={ui.mutationContainer}>
                <label class={ui.checkboxField}>
                  <Checkbox
                    checked={mutateAffine()}
                    onChange={setMutateAffine}
                  />
                  <span>Mutate Affine Coefs</span>
                </label>
                <Show when={mutateAffine()}>
                  <div class={ui.field}>
                    <span class={ui.fieldLabel}>Affine Mode</span>
                    <div class={ui.pillsRow}>
                      <button
                        type="button"
                        class={ui.pillButton}
                        classList={{
                          [ui.pillButtonActive as string]:
                            affineMode() === 'smart',
                        }}
                        title="Random rotate / scale / move on the existing affine"
                        onClick={() => setAffineMode('smart')}
                      >
                        Smart
                      </button>
                      <button
                        type="button"
                        class={ui.pillButton}
                        classList={{
                          [ui.pillButtonActive as string]:
                            affineMode() === 'full',
                        }}
                        title="Randomize every coefficient independently"
                        onClick={() => setAffineMode('full')}
                      >
                        Full
                      </button>
                    </div>
                  </div>
                </Show>
                <label class={ui.checkboxField}>
                  <Checkbox
                    checked={mutateColors()}
                    onChange={setMutateColors}
                  />
                  <span>Mutate Colors</span>
                </label>
                <label class={ui.checkboxField}>
                  <Checkbox
                    checked={recordHistoryOnMutate()}
                    onChange={setRecordHistoryOnMutate}
                  />
                  <span>Save Previous to History</span>
                </label>
                <div class={ui.field}>
                  <span class={ui.fieldLabel}>Mutate Variations</span>
                  <div class={ui.pillsRow}>
                    <button
                      type="button"
                      class={ui.pillButton}
                      classList={{
                        [ui.pillButtonActive as string]:
                          mutateVariations() === 'all',
                      }}
                      onClick={() => setMutateVariations('all')}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      class={ui.pillButton}
                      classList={{
                        [ui.pillButtonActive as string]:
                          mutateVariations() === 'modify',
                      }}
                      onClick={() => setMutateVariations('modify')}
                    >
                      Params
                    </button>
                    <button
                      type="button"
                      class={ui.pillButton}
                      classList={{
                        [ui.pillButtonActive as string]:
                          mutateVariations() === 'none',
                      }}
                      onClick={() => setMutateVariations('none')}
                    >
                      None
                    </button>
                  </div>
                </div>

                {/* --- Mutation Lab: fine-grained rate controls --- */}
                <div class={ui.mutationLabDivider} />

                <div class={ui.field}>
                  <span class={ui.fieldLabel}>Preset</span>
                  <div class={ui.pillsRow}>
                    <For
                      each={
                        [...Object.keys(MUTATION_PRESETS), 'Custom'] as (
                          | MutationPresetName
                          | 'Custom'
                        )[]
                      }
                    >
                      {(name) => (
                        <button
                          type="button"
                          class={ui.pillButton}
                          classList={{
                            [ui.pillButtonActive as string]:
                              mutationPreset() === name,
                          }}
                          title={
                            name === 'Custom'
                              ? 'Custom settings from sliders below'
                              : `${name}: ${Object.entries(
                                  MUTATION_PRESETS[name],
                                )
                                  .map(([k, v]) => `${k}=${v}`)
                                  .join(', ')}`
                          }
                          onClick={() => {
                            applyMutationPreset(name)
                          }}
                        >
                          {name}
                        </button>
                      )}
                    </For>
                  </div>
                </div>

                <Show when={mutateAffine()}>
                  <div class={ui.field}>
                    <span class={ui.fieldLabel}>
                      Affine Rate: {(affineMutationRate() * 100).toFixed(0)}%
                    </span>
                    <div class={ui.sliderField}>
                      <Slider
                        value={affineMutationRate()}
                        min={0}
                        max={1}
                        step={0.01}
                        onInput={(v) => {
                          setAffineMutationRate(v)
                          markMutationCustom()
                        }}
                        formatValue={(v) => `${Math.round(v * 100)}%`}
                      />
                    </div>
                  </div>
                </Show>

                <Show when={mutateColors()}>
                  <div class={ui.field}>
                    <span class={ui.fieldLabel}>
                      Color Rate: {(colorMutationRate() * 100).toFixed(0)}%
                    </span>
                    <div class={ui.sliderField}>
                      <Slider
                        value={colorMutationRate()}
                        min={0}
                        max={1}
                        step={0.01}
                        onInput={(v) => {
                          setColorMutationRate(v)
                          markMutationCustom()
                        }}
                        formatValue={(v) => `${Math.round(v * 100)}%`}
                      />
                    </div>
                  </div>
                </Show>

                <Show when={mutateVariations() !== 'none'}>
                  <div class={ui.field}>
                    <span class={ui.fieldLabel}>
                      Weight Perturb: {(variationWeightRate() * 100).toFixed(0)}
                      %
                    </span>
                    <div class={ui.sliderField}>
                      <Slider
                        value={variationWeightRate()}
                        min={0}
                        max={1}
                        step={0.01}
                        onInput={(v) => {
                          setVariationWeightRate(v)
                          markMutationCustom()
                        }}
                        formatValue={(v) => `${Math.round(v * 100)}%`}
                      />
                    </div>
                  </div>
                  <div class={ui.field}>
                    <span class={ui.fieldLabel}>
                      Swap Type Chance:{' '}
                      {(variationSwapChance() * 100).toFixed(0)}%
                    </span>
                    <div class={ui.sliderField}>
                      <Slider
                        value={variationSwapChance()}
                        min={0}
                        max={1}
                        step={0.01}
                        onInput={(v) => {
                          setVariationSwapChance(v)
                          markMutationCustom()
                        }}
                        formatValue={(v) => `${Math.round(v * 100)}%`}
                      />
                    </div>
                  </div>
                </Show>

                <div class={ui.field}>
                  <span class={ui.fieldLabel}>
                    Add Transform: {(mutationAddChance() * 100).toFixed(0)}%
                  </span>
                  <div class={ui.sliderField}>
                    <Slider
                      value={mutationAddChance()}
                      min={0}
                      max={0.3}
                      step={0.01}
                      onInput={(v) => {
                        setMutationAddChance(v)
                        markMutationCustom()
                      }}
                      formatValue={(v) => `${Math.round(v * 100)}%`}
                    />
                  </div>
                </div>

                <div class={ui.field}>
                  <span class={ui.fieldLabel}>
                    Remove Transform:{' '}
                    {(mutationRemoveChance() * 100).toFixed(0)}%
                  </span>
                  <div class={ui.sliderField}>
                    <Slider
                      value={mutationRemoveChance()}
                      min={0}
                      max={0.3}
                      step={0.01}
                      onInput={(v) => {
                        setMutationRemoveChance(v)
                        markMutationCustom()
                      }}
                      formatValue={(v) => `${Math.round(v * 100)}%`}
                    />
                  </div>
                </div>
              </div>
            </Show>
          </div>

          {/* Collapsible Animation Settings */}
          <div class={ui.paletteWrapper}>
            <button
              type="button"
              class={ui.paletteHeader}
              onClick={() => setAnimationExpanded(!animationExpanded())}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class={ui.chevron}
                classList={{
                  [ui.chevronExpanded as string]: animationExpanded(),
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <span>Animation Settings</span>
            </button>
            <Show when={animationExpanded()}>
              <div class={ui.animContainer}>
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
                    <Checkbox
                      checked={animTransformColor()}
                      onChange={setAnimTransformColor}
                    />
                    <span>Transform Colors</span>
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
                <label class={ui.checkboxField}>
                  <Checkbox
                    checked={animClearFirst()}
                    onChange={setAnimClearFirst}
                  />
                  <span>Clear existing keyframes first</span>
                </label>
              </div>
            </Show>
          </div>

          {/* Preview gallery: pick a flame from a page of random previews
              instead of click-spamming Generate. Mounts (and renders the
              off-screen previews) only while expanded. */}
          <div class={ui.paletteWrapper}>
            <button
              type="button"
              class={ui.paletteHeader}
              onClick={() => setGalleryExpanded(!galleryExpanded())}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class={ui.chevron}
                classList={{
                  [ui.chevronExpanded as string]: galleryExpanded(),
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <span>Preview Gallery</span>
            </button>
            <Show when={galleryExpanded()}>
              <div class={ui.paletteContainer}>
                <RandomizerGallery
                  buildConfig={buildConfig}
                  buildMutationOptions={buildMutationOptions}
                  hardwareTier={props.hardwareTier}
                  selectionActive={selectionOwner() === 'gallery'}
                  onApply={(flame) => {
                    setSelectionOwner('gallery')
                    props.onApplyCandidate(flame)
                  }}
                />
              </div>
            </Show>
          </div>

          <div class={ui.buttonGroup}>
            <Button
              class={ui.primaryButton}
              onClick={handleGenerate}
              disabled={props.isBusy}
            >
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
            <Button
              class={ui.secondaryButton}
              onClick={handleMutate}
              disabled={props.isBusy}
            >
              <svg
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
                fill="none"
                class={ui.btnIcon}
              >
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Mutate Active Flame
            </Button>
            <Button
              class={ui.secondaryButton}
              onClick={handleRandomizeAnimation}
            >
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
            <Button class={ui.secondaryButton} onClick={handleSmartAnimation}>
              <svg
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
                fill="none"
                class={ui.btnIcon}
              >
                <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
                <path d="M19 15l.7 1.8L21.5 17.5 19.7 18.2 19 20l-.7-1.8L16.5 17.5 18.3 16.8z" />
              </svg>
              Smart Animate
            </Button>
          </div>
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
                          selectionOwner() === 'history' &&
                          props.selectedTimestamp === entry.timestamp,
                      }}
                      onClick={() => {
                        setSelectionOwner('history')
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
