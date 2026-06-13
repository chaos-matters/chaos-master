import '@/commands/builtins'
import { createEffect, createMemo, createSignal, ErrorBoundary, For, onMount, Show, Suspense, } from 'solid-js'
import { createStore } from 'solid-js/store'
import { Dynamic } from 'solid-js/web'
import { vec2f, vec3f, vec4f } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import { executeCommand } from '@/commands/registry'
import { useKeyframeTarget } from '@/contexts/KeyframeTargetContext'
import { useToast } from '@/contexts/ToastContext'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { WheelZoomCamera3D } from '@/lib/WheelZoomCamera3D'
import { useShortcutManager } from '@/shortcuts'
import { createDragHandler } from '@/utils/createDragHandler'
import { recordEntries, recordKeys } from '@/utils/record'
import ui from './App.module.css'
import { AffineEditor } from './components/AffineEditor/AffineEditor'
import { BenchmarkButton } from './components/BenchmarkButton/BenchmarkButton'
import { createShowBenchmark } from './components/BenchmarkModal/BenchmarkModal'
import { BlendFlameGallery } from './components/BlendFlameGallery/BlendFlameGallery'
import { Button } from './components/Button/Button'
import { CollapsibleCard } from './components/CollapsibleCard/CollapsibleCard'
import { ColorPicker } from './components/ColorPicker/ColorPicker'
import { Card } from './components/ControlCard/ControlCard'
import { createShowCustomVariationEditor } from './components/CustomVariationEditor/CustomVariationEditor'
import { DebugOverlay } from './components/DebugOverlay'
import { DiceButton } from './components/DiceButton/DiceButton'
import { createDiscordShareModal } from './components/DiscordShareModal/DiscordShareModal'
import { Dropzone } from './components/Dropzone/Dropzone'
import { createExportPngDialog } from './components/ExportPngDialog/ExportPngDialog'
import { FlameColorEditor, handleColor, } from './components/FlameColorEditor/FlameColorEditor'
import { FlameRandomizerCard } from './components/FlameRandomizerCard/FlameRandomizerCard'
import { FloatingActions } from './components/FloatingActions/FloatingActions'
import { createShowHelp } from './components/HelpModal/HelpModal'
import { ConfirmOverwriteRecentModal } from './components/LoadFlameModal/ConfirmOverwriteRecentModal'
import { createLoadFlame } from './components/LoadFlameModal/LoadFlameModal'
import { createLogoFaviconGenerator } from './components/LogoFaviconGenerator/LogoFaviconGenerator'
import { useRequestModal } from './components/Modal/ModalContext'
import { OrientationGizmo } from './components/OrientationGizmo/OrientationGizmo'
import { PaletteSelector } from './components/PaletteSelector/PaletteSelector'
import { ProgressBar } from './components/ProgressBar/ProgressBar'
import { getPresetFromQuality, qualityPresets, } from './components/Quality/QualityPresets'
import { QuickVariationPicker } from './components/QuickVariationPicker/QuickVariationPicker'
import { createShareLinkModal } from './components/ShareLinkModal/ShareLinkModal'
import { AngleEditor } from './components/Sliders/ParametricEditors/AngleEditor'
import { ScrubInput } from './components/Sliders/ScrubInput'
import { Slider } from './components/Sliders/Slider'
import { SoftwareVersion } from './components/SoftwareVersion/SoftwareVersion'
import { SpotlightTour } from './components/SpotlightTour/SpotlightTour'
import { KeyframeDiamond } from './components/Timeline/KeyframeDiamond'
import { TimelineSection } from './components/Timeline/TimelineSection'
import { createVariationSelector } from './components/VariationSelector/VariationSelector'
import { ViewControls } from './components/ViewControls/ViewControls'
import { ChangeHistoryContextProvider } from './contexts/ChangeHistoryContext'
import { useCompactMode } from './contexts/CompactModeContext'
import { useTheme } from './contexts/ThemeContext'
import { TimelineContextProvider } from './contexts/TimelineContext'
import { DEFAULT_POINT_COUNT, DEFAULT_QUALITY, DEFAULT_RENDER_INTERVAL_MS, DEFAULT_RESOLUTION, IS_DEV, } from './defaults'
import { colorInitModeToImplFn } from './flame/colorInitMode'
import { applyColorMapToFlame } from './flame/colorMap'
import { drawModeToImplFn } from './flame/drawMode'
import { example1 } from './flame/examples/example1'
import { example34 } from './flame/examples/example34'
import { initExample } from './flame/examples/initExample'
import { Flam3 } from './flame/Flam3'
import { pointInitModeToImplFn } from './flame/pointInitMode'
import { pointInitMode3DToImplFn } from './flame/pointInitMode3D'
import { generateRandomFlame, mutateFlame, random01, randomizeAllColors, randomizeVariationParams, randomRange, } from './flame/randomize'
import { accumulatedPointCount, animationExportCancel, animationExportProgress, animationExportRunning, cameraDuringExportEnabled, exportProgress, exportQuality, qualityPointCountLimit, setCurrentQuality, setForceAnimationExportNow, setForceExportNow, setQualityPointCountLimit, } from './flame/renderStats'
import { MAX_CAMERA_ZOOM_VALUE, MIN_CAMERA_ZOOM_VALUE, } from './flame/schema/flameSchema'
import { generateTransformId, generateVariationId, } from './flame/transformFunction'
import { defaultLinearType } from './flame/variationRegistry'
import { allTransformVariations, isAnyParametricVariationType, isVariationType, } from './flame/variations'
import { deleteCustomVariation, duplicateCustomVariation, getCustomVariations, loadCustomVariations, } from './flame/variations/custom'
import { getNormalizedVariationName, getParamsEditor, getVariationDefault, } from './flame/variations/utils'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { BoxArrowRight, Cross, Eye, EyeOff, Menu, Plus, Share, Terminal, } from './icons'
import { AutoCanvas } from './lib/AutoCanvas'
import { createAnimationExport } from './utils/animationExport'
import { deepClone } from './utils/clone'
import { createStoreHistory } from './utils/createStoreHistory'
import { sendFlameToDiscord } from './utils/discordWebhook'
import { addFlameDataToPng } from './utils/flameInPng'
import { hardwareTierToPreset } from './utils/hardwareTier'
import { compressJsonQueryParam } from './utils/jsonQueryParam'
import { persistentSignal } from './utils/persistentSignal'
import { addRandomizerHistoryEntry, clearRandomizerHistory, loadRandomizerHistoryEntries, MAX_RANDOMIZER_HISTORY_LIMIT, } from './utils/randomizerHistoryDB'
import { buildReadableIds } from './utils/readableIds'
import { getOldestRecentFlame, saveRecentFlame } from './utils/recentFlames'
import { sum } from './utils/sum'
import { createTimelineState, resolveKeyframeValue } from './utils/timeline'
import { useAppDragAndDrop } from './utils/useAppDragAndDrop'
import { useKeyboardShortcuts } from './utils/useKeyboardShortcuts'
import type { Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { Vec3 } from 'wgpu-matrix'
import type { QualityPreset } from './components/Quality/QualityPresets'
import type { QuickPickerMode } from './components/QuickVariationPicker/QuickVariationPicker'
import type { TourContext } from './components/SpotlightTour/tourTypes'
import type { ColorMap, Palette } from './flame/colorMap'
import type { PointInitMode } from './flame/pointInitMode'
import type { GenerateRandomFlameConfig, MutateFlameOptions, } from './flame/randomize'
import type { FlameDescriptor, TransformFunction, TransformId, VariationId, } from './flame/schema/flameSchema'
import type { Dims } from './flame/variationRegistry'
import type { TransformVariationType } from './flame/variations'
import type { CustomVariationDef } from './flame/variations/custom/types'
import type { TransformVariationType3D } from './flame/variations3D'
import type { AnimationExportConfig } from './utils/animationExport'
import type { HardwareTier } from './utils/hardwareTier'
import type { SharePayload } from './utils/jsonQueryParam'
import type { RandomizerHistoryEntry } from './utils/randomizerHistoryDB'
import type { EasingCurve, TimelineTrack } from './utils/timeline'
import type { CommandContext } from '@/commands/types'

const EDGE_FADE_COLOR = {
  light: vec4f(0.96, 0.96, 0.96, 0.7),
  dark: vec4f(0, 0, 0, 0.6),
}

function formatPercent(x: number) {
  if (x === 1) {
    return `100 %`
  }
  return `${(x * 100).toFixed(1)} %`
}

function newDefaultTransform(dims: Dims = 2): TransformFunction {
  const is3D = dims === 3
  const identity = is3D
    ? {
        a: 1,
        b: 0,
        c: 0,
        d: 0,
        e: 0,
        f: 1,
        g: 0,
        h: 0,
        i: 0,
        j: 0,
        k: 1,
        l: 0,
      }
    : { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
  return {
    probability: 1,
    colorSpeed: 0.4,
    color: { x: 0, y: 0 },
    preAffine: identity,
    postAffine: identity,
    visible: true,
    variations: {
      [generateVariationId()]: getVariationDefault(
        defaultLinearType(dims),
        1.0,
      ),
    },
  }
}

export type ExportImageInfo = {
  /** True when the canvas holds a final color-graded image at the requested
   *  quality limit, i.e. it is safe to capture the canvas for an export. */
  finalImageReady: boolean
}

export type ExportImageType = (
  canvas: HTMLCanvasElement,
  info?: ExportImageInfo,
) => void

export type AppProps = {
  flameFromQuery?: SharePayload
  flameFromWelcome?: () => FlameDescriptor | undefined
  welcomeTracks?: () => TimelineTrack[] | undefined
  resetFlameFromWelcome?: () => void
  hardwareTier?: HardwareTier | null
  onHardwareTierChange?: (tier: HardwareTier) => void
}

export function extractFlameVariationTypes(
  descriptor: FlameDescriptor,
): TransformVariationType[] {
  const result: TransformVariationType[] = []
  for (const transform of Object.values(descriptor.transforms)) {
    for (const variation of Object.values(transform.variations)) {
      result.push(variation.type)
    }
  }
  return result
}

function addTransformWithVariation(draft: FlameDescriptor, type: string) {
  const t = deepClone(
    newDefaultTransform((draft.renderSettings.dimensions ?? 2) as Dims),
  )
  t.variations = {
    [generateVariationId()]: {
      type,
      weight: 1,
      visible: true,
    },
  }
  draft.transforms[generateTransformId()] = t
}

export function MainWorkspace(props: AppProps) {
  const { theme, setTheme } = useTheme()
  const { targetedParameter, setTargetedParameter } = useKeyframeTarget()
  let isRandomizingAnimation = false

  createEffect(() => {
    const path = targetedParameter()
    if (path && !isRandomizingAnimation) {
      // Find the element with the matching data-parameter-path
      const el = document.querySelector(`[data-parameter-path="${path}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  })

  const [qualityPreset, setQualityPreset] = createSignal<QualityPreset>(
    props.hardwareTier
      ? hardwareTierToPreset(props.hardwareTier)
      : getPresetFromQuality(DEFAULT_QUALITY),
  )

  createEffect(() => {
    if (props.hardwareTier) {
      setQualityPreset(hardwareTierToPreset(props.hardwareTier))
    }
  })

  const [pixelRatio, setPixelRatio] = createSignal(DEFAULT_RESOLUTION)
  const [onExportImage, setOnExportImage] = createSignal<ExportImageType>()

  // Dev-only: crash injection trigger (renders inside ErrorBoundary)
  const [devCrashTest, setDevCrashTest] = createSignal(false)
  const [adaptiveFilterEnabled, setAdaptiveFilterEnabled] = createSignal(true)
  const [animationEnabled, setAnimationEnabled] = createSignal(true)
  const [blendFlame, setBlendFlame] = createSignal<
    FlameDescriptor | undefined
  >()
  const [blendWeight, setBlendWeight] = createSignal(0)
  const [hideDiceButtons, setHideDiceButtons] = createSignal(false)
  const { toastMessage, showToast } = useToast()
  const SIDEBAR_RESIZABLE = false
  const { isCompact, setCompact } = useCompactMode()
  const [showSidebar, setShowSidebar] = createSignal(true)
  const _requestModal = useRequestModal()
  const [sidebarHidden, setSidebarHidden] = createSignal(
    window.innerWidth < 769,
  )
  const [sidebarLayoutMode, setSidebarLayoutMode] = persistentSignal<
    'compact' | 'wide'
  >('sidebar-layout-mode', 'wide')
  const sidebarWidth = createMemo(() =>
    sidebarLayoutMode() === 'wide' ? 26 : 21,
  )
  const setSidebarWidth = () => {} // Drag resize disabled
  let sidebarRef: HTMLDivElement | undefined
  let sidebarScrollRef: HTMLDivElement | undefined
  let savedScrollTop = 0
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [sidebarEl, setSidebarEl] = createSignal<HTMLDivElement | undefined>()
  const floatingLeft = () => {
    const rootFontSize = parseFloat(
      // eslint-disable-next-line no-restricted-globals
      getComputedStyle(document.documentElement).fontSize,
    )
    return sidebarWidth() * rootFontSize + 8
  }
  const floatingTop = () => 8
  const [isMobile, setIsMobile] = createSignal(window.innerWidth < 769)
  createEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    if (mq.matches) setCompact(true)
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
      if (e.matches) setCompact(true)
      // Auto-hide sidebar when switching to mobile layout
      if (e.matches) setSidebarHidden(true)
    }
    mq.addEventListener('change', handler)
    return () => {
      mq.removeEventListener('change', handler)
    }
  })
  // Hide timeline by default on mobile -- users can toggle it back on
  const [showTimeline, setShowTimeline] = createSignal(window.innerWidth >= 769)
  const [selectedPaletteId, setSelectedPaletteId] = createSignal<string>('')

  const [selectedPalette, setSelectedPalette] = createSignal<
    Palette | undefined
  >(undefined)
  const [prePaletteColors, setPrePaletteColors] = createSignal<
    Record<string, { x: number; y: number }>
  >({})
  const [flameDescriptor, setFlameDescriptor, history] = createStoreHistory(
    createStore(
      deepClone(
        props.flameFromWelcome?.() ?? props.flameFromQuery?.flame ?? example1,
      ),
    ),
  )
  if (IS_DEV) {
    console.info('[share:app] store initialized', {
      source: props.flameFromWelcome?.()
        ? 'welcome'
        : props.flameFromQuery?.flame
          ? 'query'
          : 'default',
      transformCount: recordKeys(flameDescriptor.transforms).length,
      firstColor: Object.values(flameDescriptor.transforms)[0]?.color,
      queryFlamePresent: !!props.flameFromQuery?.flame,
      queryAnimPresent: !!props.flameFromQuery?.animation,
    })
  }
  createEffect(() => {
    const newFlame = props.flameFromWelcome?.()
    if (newFlame !== undefined) {
      history.replace(deepClone(newFlame))
      // Load animation tracks if the welcome selection includes them
      const tracks = props.welcomeTracks?.()
      if (IS_DEV) {
        console.info('[welcome] flame selected, tracks:', {
          hasTracks: !!tracks,
          trackCount: tracks?.length ?? 0,
          trackPaths: tracks?.map((t) => t.parameterPath) ?? [],
        })
      }
      if (tracks && tracks.length > 0) {
        setLoadedAnimation({
          flame: deepClone(newFlame),
          tracks: tracks.map((t) => ({
            ...t,
            keyframes: t.keyframes.map((kf) => ({ ...kf })),
          })),
        })
      }
      props.resetFlameFromWelcome?.()
    }
  })

  const symTransforms = createMemo(() =>
    recordEntries(flameDescriptor.transforms).filter(([tid]) =>
      tid.startsWith('_sym__'),
    ),
  )

  // Stable ID list for <For> -- only changes when transforms are added/removed,
  // not when their values change, so dragging angle editors stays fluid.
  const symTransformIds = createMemo(() => symTransforms().map(([tid]) => tid))

  const currentSymType = createMemo(() => {
    const syms = symTransforms() || []
    return syms.some(
      ([, t]) =>
        t?.preAffine?.a === -1 &&
        t.preAffine.d === 0 &&
        t.preAffine.b === 0 &&
        t.preAffine.e === 1,
    )
      ? 'dihedral'
      : 'rotational'
  })

  const currentSymFolds = createMemo(() => {
    const isDihedral = currentSymType() === 'dihedral'
    const syms = symTransforms() || []
    return isDihedral ? syms.length : syms.length + 1
  })

  const applySymmetry = (n: number, type: 'rotational' | 'dihedral') => {
    setFlameDescriptor((draft) => {
      for (const tid of recordKeys(draft.transforms)) {
        if (tid.startsWith('_sym__')) {
          delete draft.transforms[tid]
        }
      }

      const totalWeight = sum(
        Object.values(draft.transforms).map((t) => t.probability),
      )
      const symWeight = Math.max(totalWeight, 1)

      for (let i = 1; i < n; i++) {
        const angle = (2 * Math.PI * i) / n
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        draft.transforms[generateTransformId('sym')] = {
          probability: symWeight,
          colorSpeed: 0,
          color: { x: 0, y: 0 },
          visible: true,
          preAffine: { a: cos, b: -sin, c: 0, d: sin, e: cos, f: 0 },
          postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          variations: {
            [generateVariationId()]: getVariationDefault(
              defaultLinearType(
                (flameDescriptor.renderSettings.dimensions ?? 2) as Dims,
              ),
              1,
            ),
          },
        }
      }

      if (type === 'dihedral') {
        draft.transforms[generateTransformId('sym')] = {
          probability: symWeight,
          colorSpeed: 0,
          color: { x: 0, y: 0 },
          visible: true,
          preAffine: { a: -1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          variations: {
            [generateVariationId()]: getVariationDefault(
              defaultLinearType(
                (flameDescriptor.renderSettings.dimensions ?? 2) as Dims,
              ),
              1,
            ),
          },
        }
      }
    })
  }

  const totalProbability = createMemo(() =>
    sum(Object.values(flameDescriptor.transforms).map((f) => f.probability)),
  )
  const {
    loadModalIsOpen,
    showLoadFlameModal,
    loadedAnimation,
    setLoadedAnimation,
    clearLoadedAnimation,
  } = createLoadFlame(
    history,
    () => flameDescriptor.renderSettings.dimensions ?? 2,
  )

  const [showBlendGallery, setShowBlendGallery] = createSignal(false)

  function pickBlendFlame() {
    setShowBlendGallery(true)
  }

  // Hover preview: temporarily set blend flame at 40% weight
  let prevBlendFlame: FlameDescriptor | undefined
  let prevBlendWeight = 0

  function handlePreviewBlend(flame: FlameDescriptor | null) {
    if (flame) {
      prevBlendFlame = blendFlame()
      prevBlendWeight = blendWeight()
      setBlendFlame(flame)
      setBlendWeight(0.4)
    } else if (prevBlendFlame !== undefined) {
      setBlendFlame(prevBlendFlame)
      setBlendWeight(prevBlendWeight)
      prevBlendFlame = undefined
    }
  }

  const [hoveredBlendName, setHoveredBlendName] = createSignal<string | null>(
    null,
  )

  const { showVariationSelector, varSelectorModalIsOpen } =
    createVariationSelector(history, props.hardwareTier)

  const { showCustomVariationEditor, customVariationEditorIsOpen } =
    createShowCustomVariationEditor()

  const isAnyModalOpen = () =>
    loadModalIsOpen() ||
    varSelectorModalIsOpen() ||
    exportModalIsOpen() ||
    customVariationEditorIsOpen()

  // Quick variation picker state
  const [quickPickerMode, setQuickPickerMode] =
    persistentSignal<QuickPickerMode>('quick-picker-mode', 'list')
  type QuickPickState = {
    tid: TransformId
    vid: VariationId
    type: TransformVariationType | TransformVariationType3D
  } | null
  const [quickPickState, setQuickPickState] = createSignal<QuickPickState>(null)
  const [hoveredVariationType, setHoveredVariationType] = createSignal<
    TransformVariationType | TransformVariationType3D | null
  >(null)
  const [hoveredCustomVarDef, setHoveredCustomVarDef] =
    createSignal<CustomVariationDef | null>(null)

  // Trigger for refreshing the custom variations list (incremented on delete/duplicate/modal close)
  const [customVarsVersion, setCustomVarsVersion] = createSignal(0)
  const customVariationsList = createMemo(() => {
    void customVarsVersion()
    return getCustomVariations()
  })

  // Compute a temporary flame with the hovered variation swapped in.
  // Falls back to the real flameDescriptor when nothing is hovered.
  const effectiveFlame = createMemo<FlameDescriptor>(() => {
    // Custom variation hover — add a new transform on top
    const hoveredCV = hoveredCustomVarDef()
    if (hoveredCV) {
      try {
        const clone: FlameDescriptor = deepClone(flameDescriptor)
        const transform = newDefaultTransform()
        transform.variations = {
          [generateVariationId()]: {
            type: hoveredCV.id,
            weight: 1,
            visible: true,
          },
        }
        clone.transforms[generateTransformId()] = transform
        return clone
      } catch {
        return flameDescriptor
      }
    }

    const hovered = hoveredVariationType()
    const state = quickPickState()
    if (!hovered || !state) return flameDescriptor
    try {
      const clone: FlameDescriptor = deepClone(flameDescriptor)
      const existingVar = clone.transforms[state.tid]?.variations[state.vid]
      if (existingVar) {
        clone.transforms[state.tid]!.variations[state.vid] = deepClone(
          getVariationDefault(hovered, existingVar.weight),
        )
      }
      return clone
    } catch {
      return flameDescriptor
    }
  })

  const finalRenderInterval = () =>
    isAnyModalOpen()
      ? Infinity
      : onExportImage()
        ? 0
        : DEFAULT_RENDER_INTERVAL_MS

  const resolvedBlendWeight = createMemo(() => {
    if (
      blendFlame() &&
      timeline.animationEnabled() &&
      timeline.tracks().length > 0
    ) {
      const val = timeline.resolveValueAtPath(
        'blendWeight',
        timeline.currentFrame(),
      )
      if (val !== null && typeof val === 'number') return val
    }
    return blendWeight()
  })

  const handlePaletteSelect = (palette: Palette) => {
    // If no palette was selected before, save the current "natural" colors
    if (selectedPaletteId() === '') {
      const colors: Record<string, { x: number; y: number }> = {}
      for (const [tid, t] of recordEntries(flameDescriptor.transforms)) {
        colors[tid] = { x: t.color.x, y: t.color.y }
      }
      setPrePaletteColors(colors)
    }

    setSelectedPaletteId(palette.id)
    setSelectedPalette(palette)
    // Convert palette entries to color map entries and apply
    const entries = palette.entries.map((entry) => ({ a: entry.a, b: entry.b }))
    const colorMap: ColorMap = {
      id: palette.id,
      name: palette.name,
      entries,
    }
    setFlameDescriptor((draft) => {
      applyColorMapToFlame(draft, colorMap)
    })
  }

  const handlePaletteUnselect = () => {
    setSelectedPaletteId('')
    setSelectedPalette(undefined)
    setFlameDescriptor((draft) => {
      const saved = prePaletteColors()
      for (const [tid, t] of recordEntries(draft.transforms)) {
        if (saved[tid]) {
          t.color = { x: saved[tid].x, y: saved[tid].y }
        }
      }
    })
    setPrePaletteColors({})
  }

  onMount(() => {
    loadCustomVariations()
    setCustomVarsVersion((v) => v + 1)
    void loadRandomizerHistoryEntries(MAX_RANDOMIZER_HISTORY_LIMIT).then(
      setRandomizerHistory,
    )
    if (IS_DEV) {
      console.info('[share:app] onMount', {
        hasQueryFlame: !!props.flameFromQuery?.flame,
        hasWelcomeFlame: !!props.flameFromWelcome?.(),
        selectedPaletteId: selectedPaletteId(),
      })
    }
  })

  const setFlameZoom: Setter<number> = (value) => {
    if (typeof value === 'function') {
      setFlameDescriptor((draft) => {
        draft.renderSettings.camera.zoom = clamp(
          value(draft.renderSettings.camera.zoom),
          MIN_CAMERA_ZOOM_VALUE,
          MAX_CAMERA_ZOOM_VALUE,
        )
      })
    } else {
      setFlameDescriptor((draft) => {
        draft.renderSettings.camera.zoom = clamp(
          value,
          MIN_CAMERA_ZOOM_VALUE,
          MAX_CAMERA_ZOOM_VALUE,
        )
      })
    }
    return flameDescriptor.renderSettings.camera.zoom
  }
  const setFlamePosition: Setter<v2f> = (value) => {
    if (typeof value === 'function') {
      setFlameDescriptor((draft) => {
        const newPos = value(vec2f(...draft.renderSettings.camera.position))
        draft.renderSettings.camera.position = [newPos.x, newPos.y]
      })
    } else {
      setFlameDescriptor((draft) => {
        draft.renderSettings.camera.position = [value.x, value.y]
      })
    }
    return flameDescriptor.renderSettings.camera.position
  }

  const setFlameTheta: Setter<number> = (value) => {
    setFlameDescriptor((draft) => {
      draft.renderSettings.camera3D.theta =
        typeof value === 'function'
          ? value(draft.renderSettings.camera3D.theta)
          : value
    })
    return flameDescriptor.renderSettings.camera3D.theta
  }
  const setFlamePhi: Setter<number> = (value) => {
    setFlameDescriptor((draft) => {
      draft.renderSettings.camera3D.phi =
        typeof value === 'function'
          ? value(draft.renderSettings.camera3D.phi)
          : value
    })
    return flameDescriptor.renderSettings.camera3D.phi
  }
  const setFlameRadius: Setter<number> = (value) => {
    setFlameDescriptor((draft) => {
      draft.renderSettings.camera3D.radius =
        typeof value === 'function'
          ? value(draft.renderSettings.camera3D.radius)
          : value
    })
    return flameDescriptor.renderSettings.camera3D.radius
  }
  const setFlameTarget3D = (value: Vec3 | ((prev: Vec3) => Vec3)) => {
    setFlameDescriptor((draft) => {
      const newTarget =
        typeof value === 'function'
          ? value(new Float32Array(draft.renderSettings.camera3D.target))
          : value
      draft.renderSettings.camera3D.target = [
        newTarget[0] ?? 0,
        newTarget[1] ?? 0,
        newTarget[2] ?? 0,
      ]
    })
    return new Float32Array(flameDescriptor.renderSettings.camera3D.target)
  }
  const setFlameFov: Setter<number> = (value) => {
    setFlameDescriptor((draft) => {
      draft.renderSettings.camera3D.fov =
        typeof value === 'function'
          ? value(draft.renderSettings.camera3D.fov)
          : value
    })
    return flameDescriptor.renderSettings.camera3D.fov
  }

  const effectiveTheta = () => {
    if (
      timeline.animationEnabled() &&
      (timeline.isPlaying() || timeline.isScrubbing())
    ) {
      const val = timeline.resolveValueAtPath(
        'camera3D.theta',
        timeline.currentFrame(),
      )
      if (val !== null && typeof val === 'number') return val
    }
    return flameDescriptor.renderSettings.camera3D.theta
  }
  const effectivePhi = () => {
    if (
      timeline.animationEnabled() &&
      (timeline.isPlaying() || timeline.isScrubbing())
    ) {
      const val = timeline.resolveValueAtPath(
        'camera3D.phi',
        timeline.currentFrame(),
      )
      if (val !== null && typeof val === 'number') return val
    }
    return flameDescriptor.renderSettings.camera3D.phi
  }
  const effectiveRadius = () => {
    if (
      timeline.animationEnabled() &&
      (timeline.isPlaying() || timeline.isScrubbing())
    ) {
      const val = timeline.resolveValueAtPath(
        'camera3D.radius',
        timeline.currentFrame(),
      )
      if (val !== null && typeof val === 'number') return val
    }
    return flameDescriptor.renderSettings.camera3D.radius
  }
  const effectiveTarget3D = () => {
    // Array properties are not easily animatable yet, so just use descriptor
    return new Float32Array(flameDescriptor.renderSettings.camera3D.target)
  }
  const effectiveFov = () => {
    if (
      timeline.animationEnabled() &&
      (timeline.isPlaying() || timeline.isScrubbing())
    ) {
      const val = timeline.resolveValueAtPath(
        'camera3D.fov',
        timeline.currentFrame(),
      )
      if (val !== null && typeof val === 'number') return val
    }
    return flameDescriptor.renderSettings.camera3D.fov
  }

  // Per-mode flame memory: the dimension toggle stashes the active flame and
  // restores the one last used in the target mode, so 2D work is never lost
  // by exploring 3D (and vice versa). First entry into 3D loads a starter.
  let stashedFlame2D: FlameDescriptor | undefined
  let stashedFlame3D: FlameDescriptor | undefined

  createEffect(() => {
    const progress = animationExportProgress()
    if (animationExportRunning() && progress) {
      if (!timeline.isPlaying()) {
        timeline.setCurrentFrame(progress.currentTimelineFrame)
      }
    }
  })

  const onDrop = useAppDragAndDrop(
    history,
    setLoadedAnimation,
    clearLoadedAnimation,
  )

  const timeline = createTimelineState()

  /**
   * Capture the current flame canvas as a downscaled PNG for OG link previews.
   * Reuses the export-image hook (same path as Discord sharing) to grab a clean
   * frame, then scales it down (aspect preserved) to keep stored images small.
   */
  async function captureOgImageBlob(maxDim = 1000): Promise<Blob | null> {
    const rawBlob = await new Promise<Blob | null>((resolve) => {
      const timer = setTimeout(() => {
        setOnExportImage(undefined)
        resolve(null)
      }, 5000)
      setOnExportImage(() => (canvas: HTMLCanvasElement) => {
        setOnExportImage(undefined)
        clearTimeout(timer)
        canvas.toBlob(
          (b) => {
            resolve(b)
          },
          'image/png',
          1,
        )
      })
    })
    if (!rawBlob) return null

    const url = URL.createObjectURL(rawBlob)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image()
        im.onload = () => {
          resolve(im)
        }
        im.onerror = reject
        im.src = url
      })
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const offscreen = document.createElement('canvas')
      offscreen.width = w
      offscreen.height = h
      const ctx = offscreen.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      return await new Promise<Blob | null>((resolve) => {
        offscreen.toBlob((b) => {
          resolve(b)
        }, 'image/png')
      })
    } catch {
      return null
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const { showShareLinkModal } = createShareLinkModal(
    flameDescriptor,
    () => timeline.tracks(),
    () => timeline.config(),
    captureOgImageBlob,
  )

  const { showDiscordShareModal } = createDiscordShareModal()

  /** Waits until the canvas backing-store size stops changing (the resize is
   *  reactive and may be debounced) so export dimensions read a settled size. */
  async function waitForStableCanvasSize(
    canvas: HTMLCanvasElement,
    timeoutMs = 2000,
  ) {
    const startMs = Date.now()
    let lastWidth = -1
    let lastHeight = -1
    while (Date.now() - startMs < timeoutMs) {
      await new Promise<void>((resolve) =>
        setTimeout(() => {
          resolve()
        }, 60),
      )
      if (canvas.width === lastWidth && canvas.height === lastHeight) return
      lastWidth = canvas.width
      lastHeight = canvas.height
    }
  }

  async function startAnimationExport(
    config: AnimationExportConfig,
    _placeholderCanvas: HTMLCanvasElement,
  ) {
    const canvas = document.querySelector<HTMLCanvasElement>(`.${ui.canvas}`)
    if (!canvas) {
      showToast('Canvas not found')
      return
    }

    // True high-resolution export: scale the canvas backing store for the
    // duration of the export so every frame is rendered at the target
    // resolution, instead of bitmap-upscaling the 1x canvas (which only
    // interpolated pixels and produced soft output).
    const baseRatio = pixelRatio()
    const scaledExport = config.resolution !== 1
    if (scaledExport) {
      setPixelRatio(baseRatio * config.resolution)
      await waitForStableCanvasSize(canvas)
    }

    // resolution: 1 — the canvas itself already renders at export resolution.
    const { promise } = createAnimationExport(
      { ...config, resolution: 1 },
      canvas,
      timeline,
      flameDescriptor,
      setFlameDescriptor,
      setOnExportImage,
    )

    promise
      .then((blob) => {
        if (blob.size === 0) return // cancelled
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'animation.mp4'
        a.click()
        URL.revokeObjectURL(url)
        showToast('Animation exported')
      })

      .catch((err: unknown) => {
        console.error('Animation export failed:', err)
        showToast('Animation export failed')
      })
      .finally(() => {
        if (scaledExport) setPixelRatio(baseRatio)
      })
  }

  const { showExportPngDialog, quickExport, exportModalIsOpen } =
    createExportPngDialog(
      flameDescriptor,
      () => timeline,
      pixelRatio,
      setPixelRatio,
      setOnExportImage,
      setFlameDescriptor,
      () => selectedPalette(),
      startAnimationExport,
    )

  async function shareToDiscord() {
    // Step 1: Capture the current flame at its current resolution to prevent flickering/resizing
    const rawBlob = await new Promise<Blob | null>((resolve) => {
      setOnExportImage(() => (canvas: HTMLCanvasElement) => {
        setOnExportImage(undefined)
        canvas.toBlob(
          (b) => {
            resolve(b)
          },
          'image/png',
          1,
        )
      })
    })

    if (!rawBlob) {
      showToast('Failed to capture flame image')
      return
    }

    // Step 2: Embed flame data into the PNG so it can be loaded back
    const tracks = timeline.tracks()
    const config = timeline.config()
    const hasAnimation = tracks.some((track) => track.keyframes.length > 0)
    const payload = hasAnimation
      ? { flame: flameDescriptor, animation: { tracks, config } }
      : flameDescriptor
    const encoded = await compressJsonQueryParam(payload)
    let pngBytes = new Uint8Array(await rawBlob.arrayBuffer())
    pngBytes = new Uint8Array(
      await addFlameDataToPng(encoded, pngBytes).arrayBuffer(),
    )
    const blob = new Blob([pngBytes], { type: 'image/png' })

    // Step 3: Show the modal with a live preview of the captured image
    const previewUrl = URL.createObjectURL(blob)
    const meta = await showDiscordShareModal(
      previewUrl,
      flameDescriptor.metadata,
    )
    URL.revokeObjectURL(previewUrl)
    if (!meta || !meta.author?.trim()) return

    // Step 4: Send to Discord
    showToast('Sending to Discord...')
    const ok = await sendFlameToDiscord(blob, meta)
    showToast(ok ? 'Shared to Discord' : 'Discord share failed')
  }

  const { showLogoFaviconGenerator } = createLogoFaviconGenerator(
    flameDescriptor,
    () => selectedPalette(),
    history,
  )

  const [randomizerHistory, setRandomizerHistory] = createSignal<
    RandomizerHistoryEntry[]
  >([])

  const [selectedHistoryTimestamp, setSelectedHistoryTimestamp] =
    createSignal<number>(0)

  const handleClearHistory = async () => {
    await clearRandomizerHistory()
    setRandomizerHistory([])
  }

  function captureMainThumbnail(size: number): Promise<string | null> {
    const canvas = document.querySelector<HTMLCanvasElement>(`.${ui.canvas}`)
    if (canvas === null) return Promise.resolve(null)
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

  const handleGenerateFlame = async (
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
  ) => {
    if (recordHistory) {
      const thumb = await captureMainThumbnail(128)
      if (thumb) {
        const entry: RandomizerHistoryEntry = {
          flame: deepClone(flameDescriptor),
          thumbnail: thumb,
          timestamp: Date.now(),
        }
        const updated = await addRandomizerHistoryEntry(
          entry,
          MAX_RANDOMIZER_HISTORY_LIMIT,
        )
        setRandomizerHistory(updated)
      }
    }

    setSelectedHistoryTimestamp(0)

    const newFlame = generateRandomFlame(config)
    const prevRs = flameDescriptor.renderSettings
    const rs = deepClone(prevRs)

    // Skip Iters
    if (randomizeSettings.skipIters) {
      const r = randomizeSettings.skipItersRange ?? [5, 30]
      rs.skipIters = Math.floor(randomRange(r[0], r[1] + 1))
    }

    // Exposure
    if (randomizeSettings.exposure) {
      const r = randomizeSettings.exposureRange ?? [-2, 2]
      rs.exposure = randomRange(r[0], r[1])
    }

    // Contrast
    if (randomizeSettings.contrast) {
      const r = randomizeSettings.contrastRange ?? [0.5, 4.0]
      rs.contrast = randomRange(r[0], r[1])
    }

    // Gamma
    if (randomizeSettings.gamma) {
      const r = randomizeSettings.gammaRange ?? [1.0, 3.5]
      rs.gamma = randomRange(r[0], r[1])
    }

    // Highlight Power
    if (randomizeSettings.highlightPower) {
      const r = randomizeSettings.highlightPowerRange ?? [0.1, 0.9]
      rs.highlightPower = randomRange(r[0], r[1])
    }

    // Vibrancy
    if (randomizeSettings.vibrancy) {
      const r = randomizeSettings.vibrancyRange ?? [0.2, 0.8]
      rs.vibrancy = randomRange(r[0], r[1])
    }

    newFlame.renderSettings = rs
    history.replace(newFlame, 'Randomize Flame')
  }

  const handleMutateFlame = async (
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
  ) => {
    if (recordHistory) {
      const thumb = await captureMainThumbnail(128)
      if (thumb) {
        const entry: RandomizerHistoryEntry = {
          flame: deepClone(flameDescriptor),
          thumbnail: thumb,
          timestamp: Date.now(),
        }
        const updated = await addRandomizerHistoryEntry(
          entry,
          MAX_RANDOMIZER_HISTORY_LIMIT,
        )
        setRandomizerHistory(updated)
      }
    }

    setSelectedHistoryTimestamp(0)

    const mutatedFlame = mutateFlame(flameDescriptor, config, mutationSettings)
    const prevRs = flameDescriptor.renderSettings
    const rs = deepClone(prevRs)

    // Skip Iters
    if (randomizeSettings.skipIters) {
      const r = randomizeSettings.skipItersRange ?? [5, 30]
      rs.skipIters = Math.floor(randomRange(r[0], r[1] + 1))
    }

    // Exposure
    if (randomizeSettings.exposure) {
      const r = randomizeSettings.exposureRange ?? [-2, 2]
      rs.exposure = randomRange(r[0], r[1])
    }

    // Contrast
    if (randomizeSettings.contrast) {
      const r = randomizeSettings.contrastRange ?? [0.5, 4.0]
      rs.contrast = randomRange(r[0], r[1])
    }

    // Gamma
    if (randomizeSettings.gamma) {
      const r = randomizeSettings.gammaRange ?? [1.0, 3.5]
      rs.gamma = randomRange(r[0], r[1])
    }

    // Highlight Power
    if (randomizeSettings.highlightPower) {
      const r = randomizeSettings.highlightPowerRange ?? [0.1, 0.9]
      rs.highlightPower = randomRange(r[0], r[1])
    }

    // Vibrancy
    if (randomizeSettings.vibrancy) {
      const r = randomizeSettings.vibrancyRange ?? [0.2, 0.8]
      rs.vibrancy = randomRange(r[0], r[1])
    }

    mutatedFlame.renderSettings = rs
    history.replace(mutatedFlame, 'Mutate Flame')
  }

  const handleUpdateRenderSettings = (
    settings: Partial<FlameDescriptor['renderSettings']>,
  ) => {
    setFlameDescriptor((draft) => {
      draft.renderSettings = {
        ...draft.renderSettings,
        ...settings,
      }
    })
  }

  const handleLoadHistory = (entry: RandomizerHistoryEntry) => {
    setSelectedHistoryTimestamp(entry.timestamp)
    history.replace(deepClone(entry.flame), 'Load History Flame')
  }

  const handleRandomizeAnimation = (presetIds: string[]) => {
    if (presetIds.length === 0) return

    isRandomizingAnimation = true
    try {
      timeline.clearAllTracks()

      const start = timeline.config().startFrame
      const end = timeline.config().endFrame
      const mid = Math.floor((start + end) / 2)

      const addLoopingTrack = (
        paramPath: string,
        startVal: number,
        minPerturb: number,
        maxPerturb: number,
        easing: EasingCurve = 'easeInOut',
      ) => {
        const perturb =
          randomRange(minPerturb, maxPerturb) * (Math.random() > 0.5 ? 1 : -1)
        const midVal = startVal + perturb
        timeline.addKeyframe(paramPath, start, startVal, easing)
        timeline.addKeyframe(paramPath, mid, midVal, easing)
        timeline.addKeyframe(paramPath, end, startVal, easing)
      }

      const addContinuousTrack = (
        paramPath: string,
        startVal: number,
        delta: number,
      ) => {
        timeline.addKeyframe(paramPath, start, startVal, 'linear')
        timeline.addKeyframe(paramPath, end, startVal + delta, 'linear')
      }

      for (const preset of presetIds) {
        if (preset === 'pan') {
          const camX = flameDescriptor.renderSettings.camera?.position?.[0] ?? 0
          const camY = flameDescriptor.renderSettings.camera?.position?.[1] ?? 0
          addLoopingTrack('camera.x', camX, 0.1, 0.4)
          addLoopingTrack('camera.y', camY, 0.1, 0.4)
        } else if (preset === 'zoom') {
          const zoom = flameDescriptor.renderSettings.camera?.zoom ?? 1
          addLoopingTrack('camera.zoom', zoom, zoom * 0.15, zoom * 0.4)
        } else if (preset === 'rot') {
          const rot = flameDescriptor.renderSettings.camera?.rotation ?? 0
          const dir = Math.random() > 0.5 ? 1 : -1
          addContinuousTrack('camera.rotation', rot, dir * 2 * Math.PI)
        } else if (preset === 'color') {
          const phase = flameDescriptor.renderSettings.palettePhase ?? 0
          const dir = Math.random() > 0.5 ? 1 : -1
          addContinuousTrack('palettePhase', phase, dir * randomRange(1, 3))
        } else if (preset === 'vibrancy') {
          const vib = flameDescriptor.renderSettings.vibrancy ?? 0.5
          const minPert = vib > 0.5 ? -0.3 : 0.1
          const maxPert = vib > 0.5 ? -0.1 : 0.3
          addLoopingTrack('vibrancy', vib, minPert, maxPert)
        } else if (preset === 'orbit') {
          const theta = flameDescriptor.renderSettings.camera3D?.theta ?? 0
          const phi =
            flameDescriptor.renderSettings.camera3D?.phi ?? Math.PI / 2
          const radius = flameDescriptor.renderSettings.camera3D?.radius ?? 5

          addContinuousTrack('camera3D.theta', theta, 2 * Math.PI)
          addLoopingTrack('camera3D.phi', phi, 0.1, 0.3)
          addLoopingTrack(
            'camera3D.radius',
            radius,
            radius * 0.1,
            radius * 0.25,
          )
        } else if (preset === 'finalTransform') {
          const q1 = Math.floor(start + (end - start) * 0.25)
          const q3 = Math.floor(start + (end - start) * 0.75)
          const dir = Math.random() > 0.5 ? 1 : -1

          timeline.addKeyframe('finalTransform.a', start, 1, 'linear')
          timeline.addKeyframe('finalTransform.a', q1, 0, 'linear')
          timeline.addKeyframe('finalTransform.a', mid, -1, 'linear')
          timeline.addKeyframe('finalTransform.a', q3, 0, 'linear')
          timeline.addKeyframe('finalTransform.a', end, 1, 'linear')

          timeline.addKeyframe('finalTransform.b', start, 0, 'linear')
          timeline.addKeyframe('finalTransform.b', q1, -dir, 'linear')
          timeline.addKeyframe('finalTransform.b', mid, 0, 'linear')
          timeline.addKeyframe('finalTransform.b', q3, dir, 'linear')
          timeline.addKeyframe('finalTransform.b', end, 0, 'linear')

          timeline.addKeyframe('finalTransform.c', start, 0, 'linear')
          timeline.addKeyframe('finalTransform.c', q1, dir, 'linear')
          timeline.addKeyframe('finalTransform.c', mid, 0, 'linear')
          timeline.addKeyframe('finalTransform.c', q3, -dir, 'linear')
          timeline.addKeyframe('finalTransform.c', end, 0, 'linear')

          timeline.addKeyframe('finalTransform.d', start, 1, 'linear')
          timeline.addKeyframe('finalTransform.d', q1, 0, 'linear')
          timeline.addKeyframe('finalTransform.d', mid, -1, 'linear')
          timeline.addKeyframe('finalTransform.d', q3, 0, 'linear')
          timeline.addKeyframe('finalTransform.d', end, 1, 'linear')
        }
      }

      timeline.setAnimationEnabled(true)
      setShowTimeline(true)
    } finally {
      setTimeout(() => {
        isRandomizingAnimation = false
      }, 200)
    }
  }

  const runTourCommand: { fn?: (id: string, ...args: unknown[]) => void } = {}

  /** Active animateValue loops -- each entry snaps to its end value when called. */
  const activeAnimations = new Set<() => void>()

  const tourContext: TourContext = {
    setSidebarOpen: setShowSidebar,
    sidebarOpen: showSidebar,
    setTimelineOpen: setShowTimeline,
    timelineOpen: showTimeline,
    setAnimationEnabled,
    animationEnabled,
    openModal: (name) => {
      if (timeline.isPlaying()) timeline.pause()
      switch (name) {
        case 'loadFlame':
          void showLoadFlameModal()
          break
        case 'exportPng':
          void showExportPngDialog()
          break
        case 'shareLink':
          void showShareLinkModal()
          break
      }
    },
    closeCurrentModal: () => {},
    scrollToTarget: (selector) => {
      document
        .querySelector(selector)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
    executeCommand: (id, ...args) => {
      console.info(
        '[tourContext:executeCommand]',
        id,
        'args:',
        ...args,
        'fn:',
        !!runTourCommand.fn,
      )
      runTourCommand.fn?.(id, ...args)
    },
    animateValue: (start, end, durationMs, onUpdate) => {
      let cancelled = false
      const startTime = window.performance.now()

      function loop(currentTime: number) {
        if (cancelled) return
        const elapsed = currentTime - startTime
        if (elapsed >= durationMs) {
          onUpdate(end)
          activeAnimations.delete(finish)
          return
        }
        // Smooth ease-out cubic
        const t = Math.min(1, elapsed / durationMs)
        const eased = 1 - Math.pow(1 - t, 3)
        onUpdate(start + (end - start) * eased)
        requestAnimationFrame(loop)
      }

      function finish() {
        if (!cancelled) {
          cancelled = true
          onUpdate(end)
        }
        activeAnimations.delete(finish)
      }

      activeAnimations.add(finish)
      requestAnimationFrame(loop)
      return finish
    },
    finishAllAnimations: () => {
      // Snap every running animation to its end value
      for (const finish of activeAnimations) {
        finish()
      }
      activeAnimations.clear()
    },
    snapshotFlame: () => {
      return deepClone(flameDescriptor)
    },
    restoreFlame: (snapshot: unknown) => {
      // Use history.replace() which calls the raw setStore(reconcile(value))
      // directly. We cannot use setFlameDescriptor(reconcile(...)) because
      // setFlameDescriptor is a HistorySetter that wraps calls in
      // produceWithPatches (structurajs draft proxy), and reconcile expects
      // a SolidJS store proxy -- mixing the two causes "node.$ is not a
      // function".
      history.replace(snapshot as FlameDescriptor, 'tour:restore')
    },
  }

  const readableIds = createMemo(() =>
    buildReadableIds(flameDescriptor.transforms),
  )

  // Sync animation enabled state into timeline so diamonds can gate on it
  createEffect(() => {
    const enabled = animationEnabled()
    if (IS_DEV) {
      console.info(
        '[anim] sync effect: setting timeline.animationEnabled →',
        enabled,
      )
    }
    timeline.setAnimationEnabled(enabled)
  })

  // Apply animation tracks when loaded from the LoadFlame modal
  createEffect(() => {
    const anim = loadedAnimation()
    if (!anim) return
    if (anim.tracks.length === 0) {
      // Plain flame loaded — clear animation state
      if (IS_DEV) console.info('[anim] clearing tracks — plain flame loaded')
      timeline.loadTracks([])
      timeline.setIsPlaying(false)
      timeline.setAnimationEnabled(false)
      setAnimationEnabled(false)
      setShowTimeline(false)
    } else {
      if (IS_DEV) {
        console.info(
          '[anim] loading animation with',
          anim.tracks.length,
          'tracks:',
          anim.tracks.map((t) => t.parameterPath),
        )
      }
      timeline.loadTracks(anim.tracks)
      timeline.setAnimationEnabled(true)
      setAnimationEnabled(true)
      setShowTimeline(true)
      timeline.setConfig({ ...timeline.config(), loop: true })
      timeline.goToFrame(0)
      timeline.play()
      showToast(
        `Animation loaded: ${anim.tracks.length} track${anim.tracks.length !== 1 ? 's' : ''} — ${anim.tracks.length * 2} keyframes`,
        3500,
      )
    }
    // Clear the signal so re-selecting the same animation triggers again
    clearLoadedAnimation()
  })

  // Apply flame and animation from shared URL (fires once when resource resolves)
  let queryApplied = false
  createEffect(() => {
    const data = props.flameFromQuery
    if (!data || queryApplied) return
    queryApplied = true

    if (IS_DEV) console.info('[share] applying flame from shared URL')
    history.replace(deepClone(data.flame))

    if (data.animation && data.animation.tracks.length > 0) {
      if (IS_DEV) {
        console.info(
          '[anim] loading shared animation:',
          data.animation.tracks.length,
          'tracks',
        )
      }
      timeline.loadTracks(data.animation.tracks)
      timeline.setAnimationEnabled(true)
      setAnimationEnabled(true)
      timeline.setConfig({
        ...timeline.config(),
        ...data.animation.config,
      })
      timeline.goToFrame(0)
      timeline.play()
    }
  })

  function getFlameValue(
    path: string,
  ):
    | number
    | string
    | [number, number, number]
    | [number, number, number, number]
    | null {
    const fd = flameDescriptor
    switch (path) {
      case 'exposure':
        return fd.renderSettings.exposure
      case 'skipIters':
        return fd.renderSettings.skipIters
      case 'vibrancy':
        return fd.renderSettings.vibrancy
      case 'contrast':
        return fd.renderSettings.contrast ?? 1
      case 'gamma':
        return fd.renderSettings.gamma ?? 2.2
      case 'highlightPower':
        return fd.renderSettings.highlightPower ?? 1
      case 'drawMode':
        return fd.renderSettings.drawMode
      case 'colorInitMode':
        return fd.renderSettings.colorInitMode
      case 'pointInitMode':
        return fd.renderSettings.pointInitMode
      case 'densityEstimationQuality':
        return fd.renderSettings.densityEstimationQuality ?? 0.8
      case 'estimatorCurve':
        return fd.renderSettings.estimatorCurve ?? 0.5
      case 'paletteMode':
        return fd.renderSettings.paletteMode ?? 0
      case 'palettePhase':
        return fd.renderSettings.palettePhase ?? 0
      case 'paletteSpeed':
        return fd.renderSettings.paletteSpeed ?? 1
      case 'backgroundColor':
        return fd.renderSettings.backgroundColor ?? [0, 0, 0]
      case 'edgeFadeColor':
        return fd.renderSettings.edgeFadeColor ?? [0, 0, 0, 0]
      case 'camera.x':
        if (
          animationEnabled() &&
          (timeline.isPlaying() || timeline.isScrubbing())
        ) {
          if (
            timeline.hasKeyframeAtFrame('camera.x', timeline.currentFrame())
          ) {
            const xTrack = timeline
              .tracks()
              .find((t) => t.parameterPath === 'camera.x')
            if (xTrack) {
              const val = resolveKeyframeValue(
                xTrack.keyframes,
                timeline.currentFrame(),
              )
              if (val !== null && typeof val === 'number') return val
            }
          }
        }
        return fd.renderSettings.camera?.position[0] ?? 0
      case 'camera.y':
        if (
          animationEnabled() &&
          (timeline.isPlaying() || timeline.isScrubbing())
        ) {
          if (
            timeline.hasKeyframeAtFrame('camera.y', timeline.currentFrame())
          ) {
            const yTrack = timeline
              .tracks()
              .find((t) => t.parameterPath === 'camera.y')
            if (yTrack) {
              const val = resolveKeyframeValue(
                yTrack.keyframes,
                timeline.currentFrame(),
              )
              if (val !== null && typeof val === 'number') return val
            }
          }
        }
        return fd.renderSettings.camera?.position[1] ?? 0
      case 'camera.zoom':
        if (
          animationEnabled() &&
          (timeline.isPlaying() || timeline.isScrubbing())
        ) {
          if (
            timeline.hasKeyframeAtFrame('camera.zoom', timeline.currentFrame())
          ) {
            const zoomTrack = timeline
              .tracks()
              .find((t) => t.parameterPath === 'camera.zoom')
            if (zoomTrack) {
              const val = resolveKeyframeValue(
                zoomTrack.keyframes,
                timeline.currentFrame(),
              )
              if (val !== null && typeof val === 'number') return val
            }
          }
        }
        return fd.renderSettings.camera?.zoom ?? 1
      case 'camera.rotation':
        return (
          ((fd.renderSettings.camera as Record<string, unknown> | undefined)
            ?.rotation as number | undefined) ?? 0
        )
      case 'camera3D.theta':
        if (
          animationEnabled() &&
          (timeline.isPlaying() || timeline.isScrubbing())
        ) {
          if (
            timeline.hasKeyframeAtFrame(
              'camera3D.theta',
              timeline.currentFrame(),
            )
          ) {
            const track = timeline
              .tracks()
              .find((t) => t.parameterPath === 'camera3D.theta')
            if (track) {
              const val = resolveKeyframeValue(
                track.keyframes,
                timeline.currentFrame(),
              )
              if (val !== null && typeof val === 'number') return val
            }
          }
        }
        return fd.renderSettings.camera3D?.theta ?? 0
      case 'camera3D.phi':
        if (
          animationEnabled() &&
          (timeline.isPlaying() || timeline.isScrubbing())
        ) {
          if (
            timeline.hasKeyframeAtFrame('camera3D.phi', timeline.currentFrame())
          ) {
            const track = timeline
              .tracks()
              .find((t) => t.parameterPath === 'camera3D.phi')
            if (track) {
              const val = resolveKeyframeValue(
                track.keyframes,
                timeline.currentFrame(),
              )
              if (val !== null && typeof val === 'number') return val
            }
          }
        }
        return fd.renderSettings.camera3D?.phi ?? Math.PI / 2
      case 'camera3D.radius':
        if (
          animationEnabled() &&
          (timeline.isPlaying() || timeline.isScrubbing())
        ) {
          if (
            timeline.hasKeyframeAtFrame(
              'camera3D.radius',
              timeline.currentFrame(),
            )
          ) {
            const track = timeline
              .tracks()
              .find((t) => t.parameterPath === 'camera3D.radius')
            if (track) {
              const val = resolveKeyframeValue(
                track.keyframes,
                timeline.currentFrame(),
              )
              if (val !== null && typeof val === 'number') return val
            }
          }
        }
        return fd.renderSettings.camera3D?.radius ?? 5
      case 'camera3D.fov':
        if (
          animationEnabled() &&
          (timeline.isPlaying() || timeline.isScrubbing())
        ) {
          if (
            timeline.hasKeyframeAtFrame('camera3D.fov', timeline.currentFrame())
          ) {
            const track = timeline
              .tracks()
              .find((t) => t.parameterPath === 'camera3D.fov')
            if (track) {
              const val = resolveKeyframeValue(
                track.keyframes,
                timeline.currentFrame(),
              )
              if (val !== null && typeof val === 'number') return val
            }
          }
        }
        return fd.renderSettings.camera3D?.fov ?? 60
      case 'blendWeight':
        return blendWeight()
      default:
        break
    }
    // Handle transform paths: transform.{tid}.{prop} or transform.{tid}.{sub}.{key}
    const parts = path.split('.')
    if (parts[0] === 'transform') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transforms = fd.transforms as Record<string, any>
      if (parts.length === 3 && parts[2] === 'probability') {
        return transforms[parts[1]!]?.probability ?? null
      }
      if (parts.length === 3 && parts[2] === 'colorSpeed') {
        return transforms[parts[1]!]?.colorSpeed ?? 0.4
      }
      if (
        parts.length === 4 &&
        (parts[2] === 'preAffine' || parts[2] === 'postAffine')
      ) {
        const affine = transforms[parts[1]!]?.[parts[2]]
        if (affine && parts[3]! in affine) {
          return affine[parts[3]!] as number
        }
      }
      if (parts.length === 4 && parts[2] === 'color') {
        const color = transforms[parts[1]!]?.color
        if (color && parts[3]! in color) {
          return color[parts[3]!]
        }
      }
      return null
    }
    // Handle transform variation parameter: {transformId}.{variationId}.{paramName}
    if (parts.length === 3) {
      const [transformId, variationId, paramName] = parts as [
        string,
        string,
        string,
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transform = (fd.transforms as Record<string, any>)[transformId] as
        | {
            variations?: Record<
              string,
              { type: string; params?: Record<string, number> }
            >
          }
        | undefined
      const variation = transform?.variations?.[variationId]
      if (variation) {
        if (variation.params) {
          const val = variation.params[paramName]
          if (val !== undefined) return val
        } else if (isAnyParametricVariationType(variation.type)) {
          // Params not initialized yet — fall back to defaults
          const vType = variation.type
          const vDef = (allTransformVariations as Record<string, unknown>)[
            vType
          ] as { paramDefaults: Record<string, number> } | undefined
          if (vDef && paramName in vDef.paramDefaults) {
            const d = vDef.paramDefaults[paramName]
            if (d !== undefined) return d
          }
        }
      }
    }
    // Handle transform variation weight: {transformId}.{variationId}
    if (
      parts.length === 2 &&
      parts[0] !== 'transform' &&
      parts[0] !== 'camera'
    ) {
      const [transformId, variationId] = parts as [string, string]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const variation = (fd.transforms as Record<string, any>)[transformId]
        ?.variations?.[variationId] as { weight?: number } | undefined
      if (variation?.weight !== undefined) return variation.weight
    }
    return null
  }
  timeline.setValueResolver(getFlameValue)

  function setFlameValue(
    path: string,
    value:
      | number
      | string
      | [number, number, number]
      | [number, number, number, number],
  ) {
    if (path === 'blendWeight') {
      setBlendWeight(value as number)
      return
    }
    setFlameDescriptor((draft) => {
      switch (path) {
        case 'exposure':
          draft.renderSettings.exposure = value as number
          break
        case 'skipIters':
          draft.renderSettings.skipIters = value as number
          break
        case 'vibrancy':
          draft.renderSettings.vibrancy = value as number
          break
        case 'contrast':
          draft.renderSettings.contrast = value as number
          break
        case 'gamma':
          draft.renderSettings.gamma = value as number
          break
        case 'highlightPower':
          draft.renderSettings.highlightPower = value as number
          break
        case 'drawMode':
          draft.renderSettings.drawMode = value as 'light' | 'paint'
          break
        case 'colorInitMode':
          draft.renderSettings.colorInitMode = value as
            | 'colorInitZero'
            | 'colorInitPosition'
          break
        case 'pointInitMode':
          draft.renderSettings.pointInitMode = value as PointInitMode
          break
        case 'densityEstimationQuality':
          draft.renderSettings.densityEstimationQuality = value as number
          break
        case 'estimatorCurve':
          draft.renderSettings.estimatorCurve = value as number
          break
        case 'paletteMode':
          draft.renderSettings.paletteMode = value as number
          break
        case 'palettePhase':
          draft.renderSettings.palettePhase = value as number
          break
        case 'paletteSpeed':
          draft.renderSettings.paletteSpeed = value as number
          break
        case 'backgroundColor':
          if (Array.isArray(value)) {
            draft.renderSettings.backgroundColor = value as [
              number,
              number,
              number,
            ]
          }
          break
        case 'edgeFadeColor':
          if (Array.isArray(value)) {
            draft.renderSettings.edgeFadeColor = value as [
              number,
              number,
              number,
              number,
            ]
          }
          break
        case 'camera.x':
          if (draft.renderSettings.camera) {
            draft.renderSettings.camera.position[0] = value as number
          }
          break
        case 'camera.y':
          if (draft.renderSettings.camera) {
            draft.renderSettings.camera.position[1] = value as number
          }
          break
        case 'camera.zoom':
          if (draft.renderSettings.camera) {
            draft.renderSettings.camera.zoom = value as number
          }
          break
        case 'camera.rotation':
          ;(draft.renderSettings.camera as
            | Record<string, unknown>
            | undefined)!.rotation = value
          break
        case 'camera3D.theta':
          if (draft.renderSettings.camera3D) {
            draft.renderSettings.camera3D.theta = value as number
          }
          break
        case 'camera3D.phi':
          if (draft.renderSettings.camera3D) {
            draft.renderSettings.camera3D.phi = value as number
          }
          break
        case 'camera3D.radius':
          if (draft.renderSettings.camera3D) {
            draft.renderSettings.camera3D.radius = value as number
          }
          break
        case 'camera3D.fov':
          if (draft.renderSettings.camera3D) {
            draft.renderSettings.camera3D.fov = value as number
          }
          break
        default: {
          const parts = path.split('.')
          if (parts[0] === 'transform') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const transforms = draft.transforms as Record<string, any>
            if (parts.length === 3 && parts[2] === 'probability') {
              if (transforms[parts[1]!]) {
                transforms[parts[1]!].probability = value as number
              }
            } else if (parts.length === 3 && parts[2] === 'colorSpeed') {
              if (transforms[parts[1]!]) {
                transforms[parts[1]!].colorSpeed = value as number
              }
            } else if (
              parts.length === 4 &&
              (parts[2] === 'preAffine' || parts[2] === 'postAffine')
            ) {
              const affine = transforms[parts[1]!]?.[parts[2]]
              if (affine && parts[3]! in affine) {
                affine[parts[3]!] = value as number
              }
            } else if (parts.length === 4 && parts[2] === 'color') {
              const color = transforms[parts[1]!]?.color
              if (color && parts[3]! in color) {
                color[parts[3]!] = value as number
              }
            }
          } else if (parts.length === 3) {
            const [transformId, variationId, paramName] = parts as [
              string,
              string,
              string,
            ]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const transform = (draft.transforms as Record<string, any>)[
              transformId
            ] as
              | {
                  variations?: Record<
                    string,
                    { type: string; params?: Record<string, number> }
                  >
                }
              | undefined
            const variation = transform?.variations?.[variationId]
            if (variation?.params) {
              variation.params[paramName] = value as number
            }
          } else if (parts.length === 2 && parts[0] !== 'camera') {
            const [transformId, variationId] = parts as [string, string]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const transform = (draft.transforms as Record<string, any>)[
              transformId
            ] as
              | {
                  variations?: Record<string, { weight?: number }>
                }
              | undefined
            const variation = transform?.variations?.[variationId]
            if (variation) {
              variation.weight = value as number
            }
          }
          break
        }
      }
    })
  }
  timeline.setValueWriter(setFlameValue)

  // Effective camera values: read from timeline whenever animation is enabled
  // so the camera follows keyframes during playback, seeking, and when stopped.
  const effectiveZoom = createMemo(() => {
    if (
      animationEnabled() &&
      (timeline.isPlaying() || timeline.isScrubbing())
    ) {
      const track = timeline
        .tracks()
        .find((t) => t.parameterPath === 'camera.zoom')
      if (track) {
        const val = resolveKeyframeValue(
          track.keyframes,
          timeline.currentFrame(),
        )
        if (val !== null && typeof val === 'number') return val
      }
    }
    return flameDescriptor.renderSettings.camera.zoom
  })

  const effectivePosition = createMemo(() => {
    if (
      animationEnabled() &&
      (timeline.isPlaying() || timeline.isScrubbing())
    ) {
      const xTrack = timeline
        .tracks()
        .find((t) => t.parameterPath === 'camera.x')
      const yTrack = timeline
        .tracks()
        .find((t) => t.parameterPath === 'camera.y')
      if (xTrack && yTrack) {
        const xVal = resolveKeyframeValue(
          xTrack.keyframes,
          timeline.currentFrame(),
        )
        const yVal = resolveKeyframeValue(
          yTrack.keyframes,
          timeline.currentFrame(),
        )
        if (
          xVal !== null &&
          yVal !== null &&
          typeof xVal === 'number' &&
          typeof yVal === 'number'
        ) {
          return vec2f(xVal, yVal)
        }
      }
    }
    return vec2f(...flameDescriptor.renderSettings.camera.position)
  })

  useKeyboardShortcuts({
    KeyF: () => {
      if ('startViewTransition' in document) {
        document.startViewTransition(() => {
          setShowSidebar((p) => !p)
        })
      } else {
        setShowSidebar((p) => !p)
      }
      return true
    },
    KeyZ: (ev) => {
      if (animationExportRunning()) return false
      if (ev.metaKey || ev.ctrlKey) {
        if (ev.shiftKey) {
          if (timeline.hasTimelineRedo()) {
            timeline.timelineRedo()
            return true
          }
          if (history.hasRedo()) {
            history.redo()
            return true
          }
        } else {
          if (timeline.hasTimelineUndo()) {
            timeline.timelineUndo()
            return true
          }
          if (history.hasUndo()) {
            history.undo()
            return true
          }
        }
      }
    },
    KeyY: (ev) => {
      if (animationExportRunning()) return false
      if (ev.metaKey || ev.ctrlKey) {
        if (timeline.hasTimelineRedo()) {
          timeline.timelineRedo()
          return true
        }
        if (history.hasRedo()) {
          history.redo()
          return true
        }
      }
    },
    KeyD: () => {
      if (animationExportRunning()) return false
      const toggleTheme = () => {
        setTheme(theme() === 'dark' ? 'light' : 'dark')
      }
      if ('startViewTransition' in document) {
        document.startViewTransition(toggleTheme)
      } else {
        toggleTheme()
      }
      return true
    },
    KeyI: (ev) => {
      if (animationExportRunning()) return false
      if (ev.altKey) {
        const path = targetedParameter()
        if (path) {
          timeline.removeKeyframe(path, timeline.currentFrame())
        }
      } else {
        const path = targetedParameter()
        if (path) {
          timeline.addKeyframeAtCurrentFrame(path)
        }
      }
      return true
    },
    Space: () => {
      if (animationExportRunning()) return false
      if (!showTimeline()) return
      if (!animationEnabled()) {
        setAnimationEnabled(true)
      }
      timeline.togglePlay()
      return true
    },
  })

  const timelineDuration = () => timeline.config().endFrame
  const setTimelineDuration: Setter<number> = (value) => {
    const newDuration =
      typeof value === 'function' ? value(timeline.config().endFrame) : value
    timeline.setConfig({ ...timeline.config(), endFrame: newDuration })
    return newDuration
  }

  // Command context: bridges registered commands to app signals
  const cmdContext: CommandContext = {
    flameDescriptor: () => flameDescriptor,
    setFlameDescriptor,
    blendFlame,
    setBlendFlame,
    blendWeight,
    setBlendWeight,
    pixelRatio,
    setPixelRatio,
    zoom: effectiveZoom,
    setZoom: setFlameZoom,
    position: effectivePosition,
    setPosition: setFlamePosition,
    sidebar: {
      open: showSidebar,
      setOpen: setShowSidebar,
    },
    timeline: {
      tracks: timeline.tracks,
      setTracks: timeline.setTracks,
      animationEnabled,
      setAnimationEnabled,
      duration: timelineDuration,
      setDuration: setTimelineDuration,
      currentFrame: timeline.currentFrame,
      setCurrentFrame: timeline.setCurrentFrame,
      play: timeline.play,
      setLoop: (loop) => timeline.setConfig({ ...timeline.config(), loop }),
      setFps: (fps) => timeline.setConfig({ ...timeline.config(), fps }),
      addKeyframe: (path, frame, value, easing) => {
        timeline.addKeyframe(
          path,
          frame,
          value,
          easing as EasingCurve | undefined,
        )
      },
    },
    camera: {
      center: () => {
        setFlameZoom(1)
        setFlamePosition(vec2f(0, 0))
      },
    },
    modal: {
      open: (name: string) => {
        if (name === 'exportPng') void showExportPngDialog()
        if (name === 'exportAnimation') void showExportPngDialog('animation')
      },
    },
  }
  useShortcutManager(cmdContext)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runTourCommand.fn = (id, ...args: any[]) => {
    executeCommand(id, cmdContext, ...args)
  }

  const startTimelineDrag = createDragHandler((initEvent) => {
    const handle = initEvent.currentTarget as HTMLElement
    const container = handle.parentElement
    if (!container) return
    const startY = initEvent.clientY
    const startHeight = container.offsetHeight

    function setHeight(px: number) {
      const clamped = Math.max(100, Math.min(window.innerHeight * 0.55, px))
      container!.style.setProperty('--timeline-height', `${clamped}px`)
    }

    return {
      onPointerMove(event) {
        const dy = startY - event.clientY
        setHeight(startHeight + dy)
      },
    }
  })

  const startSidebarDrag = createDragHandler((_initEvent) => {
    const sidebar = sidebarRef
    if (!sidebar) return

    return {
      onPointerMove() {
        setSidebarWidth()
      },
    }
  })

  return (
    <ChangeHistoryContextProvider value={history}>
      <TimelineContextProvider value={timeline}>
        <Dropzone class={ui.layout} onDrop={onDrop}>
          <>
            <div
              class={ui.canvasContainer}
              data-tour-target="canvas"
              classList={{ [ui.fullscreen as string]: !showSidebar() }}
              onClick={() => {
                // Tap canvas to close sidebar on mobile
                if (isMobile() && !sidebarHidden()) setSidebarHidden(true)
              }}
            >
              <Show when={isMobile()}>
                <button
                  class={ui.sidebarToggle}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSidebarHidden((p) => !p)
                  }}
                  aria-label="Toggle sidebar"
                >
                  <Menu />
                </button>
              </Show>
              <AutoCanvas class={ui.canvas} pixelRatio={pixelRatio()}>
                <Suspense>
                  <ErrorBoundary
                    fallback={(err) => (
                      <div
                        style={{
                          color: 'red',
                          display: 'flex',
                          'align-items': 'center',
                          'justify-content': 'center',
                          height: '100%',
                          'text-align': 'center',
                          padding: '20px',
                          'flex-direction': 'column',
                          gap: '1rem',
                        }}
                      >
                        <p>
                          Failed to render flame. The flame or animation data
                          might be invalid or incompatible.
                        </p>
                        <p>
                          <code>{String(err)}</code>
                        </p>
                        <Button
                          onClick={() => {
                            window.location.reload()
                          }}
                        >
                          Reload Page
                        </Button>
                      </div>
                    )}
                  >
                    <Show
                      when={effectiveFlame().renderSettings.dimensions === 3}
                      fallback={
                        <WheelZoomCamera2D
                          zoom={[effectiveZoom, setFlameZoom]}
                          position={[effectivePosition, setFlamePosition]}
                          interactive={() =>
                            !timeline.isPlaying() &&
                            (!animationExportRunning() ||
                              cameraDuringExportEnabled())
                          }
                        >
                          <Flam3
                            quality={
                              exportQuality() ?? qualityPresets[qualityPreset()]
                            }
                            pointCountPerBatch={DEFAULT_POINT_COUNT}
                            isExportRenderer
                            adaptiveFilterEnabled={adaptiveFilterEnabled()}
                            animationEnabled={animationEnabled()}
                            flameDescriptor={effectiveFlame()}
                            renderInterval={finalRenderInterval()}
                            onExportImage={onExportImage()}
                            edgeFadeColor={
                              showSidebar()
                                ? EDGE_FADE_COLOR[theme()]
                                : vec4f(0)
                            }
                            setCurrentQuality={(fn) =>
                              setCurrentQuality(() => fn)
                            }
                            setQualityPointCountLimit={(fn) =>
                              setQualityPointCountLimit(() => fn)
                            }
                            palette={() => selectedPalette()}
                            blendFlame={blendFlame()}
                            blendWeight={resolvedBlendWeight()}
                          />
                        </WheelZoomCamera2D>
                      }
                    >
                      <WheelZoomCamera3D
                        theta={[effectiveTheta, setFlameTheta]}
                        phi={[effectivePhi, setFlamePhi]}
                        radius={[effectiveRadius, setFlameRadius]}
                        target={[effectiveTarget3D, setFlameTarget3D]}
                        fov={[effectiveFov, setFlameFov]}
                        interactive={() =>
                          !timeline.isPlaying() &&
                          (!animationExportRunning() ||
                            cameraDuringExportEnabled())
                        }
                      >
                        <Flam3
                          quality={
                            exportQuality() ?? qualityPresets[qualityPreset()]
                          }
                          pointCountPerBatch={DEFAULT_POINT_COUNT}
                          isExportRenderer
                          adaptiveFilterEnabled={adaptiveFilterEnabled()}
                          animationEnabled={animationEnabled()}
                          flameDescriptor={effectiveFlame()}
                          renderInterval={finalRenderInterval()}
                          onExportImage={onExportImage()}
                          edgeFadeColor={
                            showSidebar() ? EDGE_FADE_COLOR[theme()] : vec4f(0)
                          }
                          setCurrentQuality={(fn) =>
                            setCurrentQuality(() => fn)
                          }
                          setQualityPointCountLimit={(fn) =>
                            setQualityPointCountLimit(() => fn)
                          }
                          palette={() => selectedPalette()}
                          blendFlame={blendFlame()}
                          blendWeight={resolvedBlendWeight()}
                        />
                      </WheelZoomCamera3D>
                    </Show>
                  </ErrorBoundary>
                </Suspense>
              </AutoCanvas>
              <Show when={hoveredVariationType()} keyed>
                {(hv) => (
                  <div class={ui.hoverPreviewBadge}>
                    Previewing: {getNormalizedVariationName(hv)}
                  </div>
                )}
              </Show>
              <Show when={hoveredCustomVarDef()} keyed>
                {(cv) => (
                  <div class={ui.hoverPreviewBadge}>
                    Previewing custom: {cv.name}
                  </div>
                )}
              </Show>
              <Show when={hoveredBlendName()} keyed>
                {(name) => (
                  <div class={ui.hoverPreviewBadge}>Blending with {name}</div>
                )}
              </Show>
              <Show when={toastMessage()}>
                {(msg) => <div class={ui.toast}>{msg()}</div>}
              </Show>
              <ProgressBar />
              <div class={ui.bottomBar}>
                <Show when={effectiveFlame().renderSettings.dimensions === 3}>
                  <OrientationGizmo
                    theta={[effectiveTheta, setFlameTheta]}
                    phi={[effectivePhi, setFlamePhi]}
                  />
                </Show>
                <div
                  class={ui.viewControlsWrapper}
                  data-tour-target="view-controls"
                  style={{
                    'pointer-events':
                      animationExportRunning() ||
                      exportProgress() !== undefined ||
                      timeline.isPlaying()
                        ? 'none'
                        : 'auto',
                    opacity:
                      animationExportRunning() ||
                      exportProgress() !== undefined ||
                      timeline.isPlaying()
                        ? 0.5
                        : 1,
                  }}
                >
                  <ViewControls
                    zoom={effectiveZoom()}
                    setZoom={setFlameZoom}
                    position={effectivePosition()}
                    setPosition={setFlamePosition}
                    pixelRatio={pixelRatio()}
                    setPixelRatio={setPixelRatio}
                    controlsDisabled={timeline.isPlaying()}
                    blendFlame={blendFlame()}
                    blendWeight={resolvedBlendWeight()}
                    onPickBlendFlame={pickBlendFlame}
                    onClearBlendFlame={() => {
                      setBlendFlame(undefined)
                    }}
                    onBlendWeightChange={setBlendWeight}
                    is3D={effectiveFlame().renderSettings.dimensions === 3}
                    theta={effectiveTheta()}
                    phi={effectivePhi()}
                    radius={effectiveRadius()}
                    fov={effectiveFov()}
                    setTheta={setFlameTheta}
                    setPhi={setFlamePhi}
                    setRadius={setFlameRadius}
                    setFov={setFlameFov}
                  />
                </div>
                <Show when={showTimeline()}>
                  <div
                    class={ui.timelineContainer}
                    style={{
                      'pointer-events':
                        animationExportRunning() ||
                        exportProgress() !== undefined ||
                        timeline.isPlaying()
                          ? 'none'
                          : 'auto',
                      opacity:
                        animationExportRunning() ||
                        exportProgress() !== undefined ||
                        timeline.isPlaying()
                          ? 0.5
                          : 1,
                    }}
                    onWheel={(ev) => {
                      if (!ev.ctrlKey && !ev.metaKey) return
                      ev.preventDefault()
                      const delta = -ev.deltaY * 0.5
                      const container = ev.currentTarget as HTMLElement
                      const currentHeight = container.offsetHeight
                      const newHeight = Math.max(
                        100,
                        Math.min(
                          window.innerHeight * 0.55,
                          currentHeight + delta,
                        ),
                      )
                      container.style.setProperty(
                        '--timeline-height',
                        `${newHeight}px`,
                      )
                    }}
                  >
                    <div
                      class={ui.timelineResizeHandle}
                      onPointerDown={startTimelineDrag}
                      title="Resize timeline"
                    />
                    <TimelineSection
                      formatTrackLabel={readableIds().formatTrackPath}
                      flameDescriptor={flameDescriptor}
                    />
                  </div>
                </Show>
              </div>
            </div>
          </>
          <DebugOverlay
            animationEnabled={animationEnabled()}
            flameDescriptor={flameDescriptor}
          />

          <Show when={showSidebar()}>
            <div
              class={ui.sidebar}
              classList={{
                [ui.sidebarLocked as string]: timeline.isPlaying(),
                [ui.sidebarHidden as string]: sidebarHidden(),
              }}
              style={{ '--sidebar-width': `${sidebarWidth()}rem` }}
              data-tour-target="sidebar"
              ref={(el) => {
                sidebarRef = el
                setSidebarEl(el)
              }}
            >
              {SIDEBAR_RESIZABLE && (
                <div
                  class={ui.sidebarResizeHandle}
                  onPointerDown={startSidebarDrag}
                />
              )}
              <Show
                when={
                  timeline.isPlaying() ||
                  animationExportRunning() ||
                  exportProgress() !== undefined
                }
              >
                <div
                  class={ui.playbackOverlay}
                  classList={{
                    [ui.exportOverlay as string]:
                      animationExportRunning() ||
                      exportProgress() !== undefined,
                  }}
                  onClick={() => {
                    if (timeline.isPlaying()) {
                      timeline.togglePlay()
                    }
                  }}
                >
                  <span class={ui.playbackOverlayText}>
                    {animationExportRunning()
                      ? 'Rendering animation...'
                      : exportProgress() !== undefined
                        ? 'Rendering image...'
                        : 'Tap to stop animation'}
                  </span>
                  <Show when={animationExportRunning()}>
                    <div class={ui.overlayActions}>
                      <button
                        class={ui.overlayStopAndSaveButton}
                        onClick={(e) => {
                          e.stopPropagation()
                          setForceAnimationExportNow(true)
                        }}
                        title="Stop after current frame and save"
                      >
                        Stop & Save
                      </button>
                      <button
                        class={ui.overlayCancelButton}
                        onClick={(e) => {
                          e.stopPropagation()
                          const cancelFn = animationExportCancel()
                          if (cancelFn) cancelFn()
                        }}
                        title="Cancel and discard"
                      >
                        Cancel
                      </button>
                    </div>
                  </Show>
                  <Show
                    when={
                      exportProgress() !== undefined &&
                      !animationExportRunning()
                    }
                  >
                    <div class={ui.overlayActions}>
                      <button
                        class={ui.overlayStopAndSaveButton}
                        onClick={(e) => {
                          e.stopPropagation()
                          setForceExportNow(true)
                        }}
                        title="Stop and export at current quality"
                      >
                        Stop & Export
                      </button>
                    </div>
                  </Show>
                </div>
              </Show>
              <Show when={isMobile()}>
                <div class={ui.sidebarCloseRow}>
                  <button
                    class={ui.sidebarCloseBtn}
                    onClick={() => setSidebarHidden(true)}
                    aria-label="Collapse sidebar"
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18">
                      <path
                        fill="currentColor"
                        d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"
                      />
                    </svg>
                  </button>
                </div>
              </Show>
              <div class={ui.sidebarScroll} ref={sidebarScrollRef}>
                <Show
                  when={showBlendGallery()}
                  fallback={
                    <>
                      <Show when={quickPickState()} keyed>
                        {(state) => (
                          <QuickVariationPicker
                            currentType={
                              flameDescriptor.transforms[state.tid]?.variations[
                                state.vid
                              ]?.type ?? state.type
                            }
                            dims={
                              (flameDescriptor.renderSettings.dimensions ??
                                2) as Dims
                            }
                            hardwareTier={props.hardwareTier}
                            pointInitMode={
                              flameDescriptor.renderSettings.pointInitMode
                            }
                            onSelect={(newType) => {
                              setFlameDescriptor((draft) => {
                                const existingVar =
                                  draft.transforms[state.tid]?.variations[
                                    state.vid
                                  ]
                                if (existingVar) {
                                  draft.transforms[state.tid]!.variations[
                                    state.vid
                                  ] = deepClone(
                                    getVariationDefault(
                                      newType,
                                      existingVar.weight,
                                    ),
                                  )
                                }
                              })
                            }}
                            onClose={() => {
                              // Save scroll position before the Show block unmounts
                              savedScrollTop = sidebarScrollRef?.scrollTop ?? 0
                              setHoveredVariationType(null)
                              setQuickPickState(null)
                              // Restore after Solid re-renders the normal sidebar
                              queueMicrotask(() => {
                                if (sidebarScrollRef) {
                                  sidebarScrollRef.scrollTop = savedScrollTop
                                }
                              })
                            }}
                            onHoverType={(type) =>
                              setHoveredVariationType(type)
                            }
                            onHoverClear={() => setHoveredVariationType(null)}
                            mode={quickPickerMode()}
                            onModeChange={setQuickPickerMode}
                            onOpenFullSelector={() => {
                              console.info(
                                '[QuickVariationPicker] onOpenFullSelector — opening full VariationSelector',
                                { tid: state.tid, vid: state.vid },
                              )
                              const currentVar =
                                flameDescriptor.transforms[state.tid]
                                  ?.variations[state.vid]
                              if (!currentVar) return
                              // Close quick picker first so modal stacking works
                              setQuickPickState(null)
                              queueMicrotask(() => {
                                showVariationSelector(
                                  deepClone(currentVar),
                                  deepClone(flameDescriptor),
                                  state.tid,
                                  state.vid,
                                  {
                                    setFlameTheta,
                                    setFlamePhi,
                                    setFlameRadius,
                                    setFlameTarget3D,
                                    setFlameFov,
                                  },
                                )
                                  .then((newValue) => {
                                    if (
                                      newValue === undefined ||
                                      !isVariationType(newValue.variation.type)
                                    ) {
                                      return
                                    }
                                    setFlameDescriptor((draft) => {
                                      draft.transforms[state.tid]!.preAffine =
                                        newValue.transform.preAffine
                                      draft.transforms[state.tid]!.variations[
                                        state.vid
                                      ] = newValue.variation
                                    })
                                  })
                                  .catch((err: unknown) => {
                                    console.warn(
                                      'Cannot load this variation, reason: ',
                                      err,
                                    )
                                  })
                              })
                            }}
                          />
                        )}
                      </Show>
                      <Show when={!quickPickState()}>
                        <CollapsibleCard title="Affine">
                          <AffineEditor
                            class={ui.affineEditor}
                            transforms={flameDescriptor.transforms}
                            setTransforms={(setFn) => {
                              setFlameDescriptor((draft) => {
                                setFn(draft.transforms)
                              })
                            }}
                            finalTransform={
                              flameDescriptor.finalTransform ?? {
                                a: 1,
                                b: 0,
                                c: 0,
                                d: 0,
                                e: 1,
                                f: 0,
                              }
                            }
                            setFinalTransform={(affine) => {
                              setFlameDescriptor((draft) => {
                                draft.finalTransform = affine
                              })
                            }}
                            is3D={
                              (flameDescriptor.renderSettings.dimensions ??
                                2) === 3
                            }
                          />
                        </CollapsibleCard>
                        <CollapsibleCard title="Color">
                          <div>
                            <FlameColorEditor
                              transforms={flameDescriptor.transforms}
                              setTransforms={(setFn) => {
                                setFlameDescriptor((draft) => {
                                  setFn(draft.transforms)
                                })
                              }}
                            />
                          </div>
                        </CollapsibleCard>
                        <CollapsibleCard title="Palette" defaultOpen={false}>
                          <PaletteSelector
                            selectedPaletteId={selectedPaletteId()}
                            onSelect={handlePaletteSelect}
                            onUnselect={handlePaletteUnselect}
                          />
                        </CollapsibleCard>
                        <Show
                          when={flameDescriptor.renderSettings.dimensions !== 3}
                        >
                          <CollapsibleCard
                            title="Custom Variations"
                            defaultOpen={false}
                          >
                            <For
                              each={customVariationsList()}
                              fallback={
                                <div class={ui.customVarEmpty}>
                                  No custom variations yet
                                </div>
                              }
                            >
                              {(def) => (
                                <div
                                  class={ui.customVarItem}
                                  onContextMenu={(e) => {
                                    e.preventDefault()
                                  }}
                                  onMouseEnter={() =>
                                    setHoveredCustomVarDef(def)
                                  }
                                  onMouseLeave={() =>
                                    setHoveredCustomVarDef(null)
                                  }
                                  onClick={() => {
                                    void showCustomVariationEditor(def).then(
                                      (addedDef) => {
                                        if (addedDef) {
                                          setFlameDescriptor((draft) => {
                                            addTransformWithVariation(
                                              draft,
                                              addedDef.id,
                                            )
                                          })
                                        }
                                        setCustomVarsVersion((v) => v + 1)
                                      },
                                    )
                                  }}
                                >
                                  <span class={ui.customVarItemName}>
                                    {def.name}
                                  </span>
                                  <div class={ui.customVarItemActions}>
                                    <button
                                      class={ui.customVarItemBtn}
                                      classList={{
                                        [ui.customVarItemBtnPrimary as string]: true,
                                      }}
                                      title="Add to flame"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setHoveredCustomVarDef(null)
                                        setFlameDescriptor((draft) => {
                                          addTransformWithVariation(
                                            draft,
                                            def.id,
                                          )
                                        })
                                      }}
                                    >
                                      <BoxArrowRight />
                                    </button>
                                    <button
                                      class={ui.customVarItemBtn}
                                      title="Duplicate"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        duplicateCustomVariation(def.id)
                                        setCustomVarsVersion((v) => v + 1)
                                      }}
                                    >
                                      ⧉
                                    </button>
                                    <button
                                      class={ui.customVarItemBtn}
                                      classList={{
                                        [ui.customVarItemBtnDanger as string]: true,
                                      }}
                                      title="Delete"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        deleteCustomVariation(def.id)
                                        setCustomVarsVersion((v) => v + 1)
                                      }}
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                              )}
                            </For>
                            <button
                              class={ui.customVarsButton}
                              onClick={async () => {
                                const addedDef =
                                  await showCustomVariationEditor()
                                if (addedDef) {
                                  setFlameDescriptor((draft) => {
                                    addTransformWithVariation(
                                      draft,
                                      addedDef.id,
                                    )
                                  })
                                }
                                setCustomVarsVersion((v) => v + 1)
                              }}
                              title="Create a new custom variation"
                            >
                              <Plus />
                              <span>Create Variation</span>
                            </button>
                          </CollapsibleCard>
                        </Show>
                        <FlameRandomizerCard
                          flame={flameDescriptor}
                          historyEntries={randomizerHistory()}
                          selectedTimestamp={selectedHistoryTimestamp()}
                          onGenerateFlame={handleGenerateFlame}
                          onMutateFlame={handleMutateFlame}
                          onLoadHistory={handleLoadHistory}
                          onClearHistory={handleClearHistory}
                          onRandomizeAnimation={handleRandomizeAnimation}
                          onUpdateRenderSettings={handleUpdateRenderSettings}
                        />
                        <For
                          each={recordEntries(
                            flameDescriptor.transforms,
                          ).filter(([tid]) => !tid.startsWith('_sym__'))}
                        >
                          {([tid, transform]) => (
                            <CollapsibleCard
                              title={readableIds().transformLabel[tid]!}
                            >
                              <div class={ui.transformGrid}>
                                <svg class={ui.variationButtonSvgColor}>
                                  <g
                                    class={ui.variationButtonColor}
                                    style={{
                                      '--color': handleColor(
                                        theme(),
                                        vec2f(
                                          transform.color.x,
                                          transform.color.y,
                                        ),
                                      ),
                                    }}
                                  >
                                    <circle
                                      class={ui.variationButtonColorCircle}
                                    />
                                  </g>
                                </svg>
                                <Show when={animationEnabled()}>
                                  <span class={ui.readableId}>
                                    {readableIds().transformLabel[tid]}
                                  </span>
                                </Show>
                                <Show when={!hideDiceButtons()}>
                                  <DiceButton
                                    onClick={() => {
                                      setFlameDescriptor((draft) => {
                                        draft.transforms[tid]!.color = {
                                          x: random01(),
                                          y: random01(),
                                        }
                                      })
                                    }}
                                    title="Randomize transform color"
                                  />
                                </Show>
                                <button
                                  class={ui.visibilityButton}
                                  title={
                                    transform.visible
                                      ? 'Hide transform'
                                      : 'Show transform'
                                  }
                                  onClick={() => {
                                    setFlameDescriptor((draft) => {
                                      draft.transforms[tid]!.visible =
                                        !draft.transforms[tid]!.visible
                                    })
                                  }}
                                >
                                  {transform.visible ? <Eye /> : <EyeOff />}
                                </button>
                                <button
                                  class={ui.deleteFlameButton}
                                  onClick={() => {
                                    setFlameDescriptor((draft) => {
                                      if (
                                        recordKeys(draft.transforms).length ===
                                        1
                                      ) {
                                        draft.transforms[tid] = deepClone(
                                          newDefaultTransform(),
                                        )
                                      } else {
                                        delete draft.transforms[tid]
                                      }
                                    })
                                  }}
                                >
                                  <Cross />
                                </button>
                                <div
                                  data-tour-target="probability"
                                  classList={{
                                    [ui.transformGridRow as string]: true,
                                    [ui.transformGridFirstRow as string]: true,
                                  }}
                                  onClick={() => {
                                    setTargetedParameter(
                                      `transform.${tid}.probability`,
                                    )
                                  }}
                                >
                                  <Slider
                                    class={ui.transformGridFirstRow}
                                    label="Probability"
                                    value={transform.probability}
                                    min={0}
                                    max={1}
                                    step={0.001}
                                    onInput={(probability) => {
                                      setFlameDescriptor((draft) => {
                                        draft.transforms[tid]!.probability =
                                          probability
                                      })
                                    }}
                                    formatValue={(value) =>
                                      formatPercent(value / totalProbability())
                                    }
                                    dataParameterPath={`transform.${tid}.probability`}
                                  />
                                </div>
                                <div
                                  classList={{
                                    [ui.transformGridRow as string]: true,
                                  }}
                                  onClick={() => {
                                    setTargetedParameter(
                                      `transform.${tid}.colorSpeed`,
                                    )
                                  }}
                                >
                                  <Slider
                                    class={ui.transformGridFirstRow}
                                    label="Color Speed"
                                    value={transform.colorSpeed ?? 0.4}
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    onInput={(val) => {
                                      setFlameDescriptor((draft) => {
                                        draft.transforms[tid]!.colorSpeed = val
                                      })
                                    }}
                                    dataParameterPath={`transform.${tid}.colorSpeed`}
                                    data-tour-target="colorSpeed-slider"
                                  />
                                </div>
                                <For each={recordEntries(transform.variations)}>
                                  {([vid, variation]) => (
                                    <>
                                      <div class={ui.transformGridRow}>
                                        <button
                                          class={ui.variationButton}
                                          data-tour-target="variation-type"
                                          value={variation.type}
                                          title={getNormalizedVariationName(
                                            variation.type,
                                          )}
                                          onClick={() => {
                                            // Auto-open sidebar on mobile so the picker is visible
                                            if (isMobile() && sidebarHidden()) {
                                              setSidebarHidden(false)
                                            }
                                            setQuickPickState({
                                              tid,
                                              vid,
                                              type: variation.type,
                                            })
                                          }}
                                          onContextMenu={(e) => {
                                            e.preventDefault()
                                            showVariationSelector(
                                              deepClone(variation),
                                              deepClone(flameDescriptor),
                                              tid,
                                              vid,
                                              {
                                                setFlameTheta,
                                                setFlamePhi,
                                                setFlameRadius,
                                                setFlameTarget3D,
                                                setFlameFov,
                                              },
                                            )
                                              .then((newValue) => {
                                                if (
                                                  newValue === undefined ||
                                                  !isVariationType(
                                                    newValue.variation.type,
                                                  )
                                                ) {
                                                  return
                                                }
                                                setFlameDescriptor((draft) => {
                                                  draft.transforms[
                                                    tid
                                                  ]!.preAffine =
                                                    newValue.transform.preAffine
                                                  draft.transforms[
                                                    tid
                                                  ]!.variations[vid] =
                                                    newValue.variation
                                                })
                                              })
                                              .catch((err: unknown) => {
                                                console.warn(
                                                  'Cannot load this variation, reason: ',
                                                  err,
                                                )
                                              })
                                          }}
                                        >
                                          <div class={ui.variationButtonText}>
                                            <Show when={animationEnabled()}>
                                              <span class={ui.readableId}>
                                                {
                                                  readableIds().variationLabel[
                                                    vid
                                                  ]
                                                }
                                              </span>
                                            </Show>
                                            <span class={ui.variationName}>
                                              {getNormalizedVariationName(
                                                variation.type,
                                              )}
                                            </span>
                                          </div>
                                        </button>
                                        <div
                                          class={ui.sliderGridWrapper}
                                          classList={{
                                            [ui.parameterTarget as string]: true,
                                          }}
                                          data-tour-target="variation-weight"
                                          onClick={() => {
                                            setTargetedParameter(
                                              `${tid}.${vid}`,
                                            )
                                          }}
                                        >
                                          <Slider
                                            value={variation.weight}
                                            min={0}
                                            max={1}
                                            step={0.001}
                                            dataParameterPath={`${tid}.${vid}`}
                                            onInput={(weight) => {
                                              setFlameDescriptor((draft) => {
                                                draft.transforms[
                                                  tid
                                                ]!.variations[vid]!.weight =
                                                  weight
                                              })
                                            }}
                                            formatValue={formatPercent}
                                          />
                                        </div>
                                        <Show when={!hideDiceButtons()}>
                                          <DiceButton
                                            onClick={() => {
                                              setFlameDescriptor((draft) => {
                                                const v =
                                                  draft.transforms[tid]!
                                                    .variations[vid]!
                                                v.weight = random01()
                                                const params =
                                                  randomizeVariationParams(
                                                    v.type,
                                                  )
                                                if (params) {
                                                  ;(
                                                    v as {
                                                      params?: Record<
                                                        string,
                                                        number
                                                      >
                                                    }
                                                  ).params = params
                                                }
                                              })
                                            }}
                                            title="Randomize variation"
                                          />
                                        </Show>
                                        <button
                                          class={ui.visibilityButton}
                                          title={
                                            variation.visible
                                              ? 'Hide variation'
                                              : 'Show variation'
                                          }
                                          onClick={() => {
                                            setFlameDescriptor((draft) => {
                                              const v =
                                                draft.transforms[tid]!
                                                  .variations[vid]!
                                              v.visible = !v.visible
                                            })
                                          }}
                                        >
                                          {variation.visible ? (
                                            <Eye />
                                          ) : (
                                            <EyeOff />
                                          )}
                                        </button>
                                        <button
                                          class={ui.deleteVariationButton}
                                          onClick={() => {
                                            setFlameDescriptor((draft) => {
                                              if (
                                                recordKeys(
                                                  draft.transforms[tid]!
                                                    .variations,
                                                ).length === 1
                                              ) {
                                                draft.transforms[
                                                  tid
                                                ]!.variations[vid] = deepClone(
                                                  getVariationDefault(
                                                    variation.type,
                                                    1,
                                                  ),
                                                )
                                              } else {
                                                delete draft.transforms[tid]!
                                                  .variations[vid]
                                              }
                                            })
                                          }}
                                        >
                                          <Cross />
                                        </button>
                                      </div>
                                      <Show
                                        when={
                                          isAnyParametricVariationType(
                                            variation.type,
                                          ) && variation
                                        }
                                        keyed
                                      >
                                        {(variation) => (
                                          <div
                                            classList={{
                                              [ui.transformGridRow as string]: true,
                                              [ui.variationParamsRow as string]: true,
                                              [ui.parameterTarget as string]: true,
                                            }}
                                            onClick={() => {
                                              setTargetedParameter(
                                                `${tid}.${vid}`,
                                              )
                                            }}
                                          >
                                            <Dynamic
                                              {...getParamsEditor(variation)}
                                              dataParameterPath={`${tid}.${vid}`}
                                              setValue={(value) => {
                                                setFlameDescriptor((draft) => {
                                                  const variationDraft =
                                                    draft.transforms[tid]
                                                      ?.variations[vid]
                                                  if (
                                                    variationDraft ===
                                                      undefined ||
                                                    !isAnyParametricVariationType(
                                                      variationDraft.type,
                                                    )
                                                  ) {
                                                    throw new Error(
                                                      `Unreachable code`,
                                                    )
                                                  }
                                                  ;(
                                                    variationDraft as {
                                                      params: Record<
                                                        string,
                                                        number
                                                      >
                                                    }
                                                  ).params = value as Record<
                                                    string,
                                                    number
                                                  >
                                                })
                                              }}
                                            />
                                          </div>
                                        )}
                                      </Show>
                                    </>
                                  )}
                                </For>

                                <button
                                  class={ui.addTransformVariationButton}
                                  onClick={() => {
                                    setFlameDescriptor((draft) => {
                                      draft.transforms[tid]!.variations[
                                        generateVariationId()
                                      ] = deepClone(
                                        getVariationDefault(
                                          defaultLinearType(
                                            (flameDescriptor.renderSettings
                                              .dimensions ?? 2) as Dims,
                                          ),
                                          1,
                                        ),
                                      )
                                    })
                                  }}
                                >
                                  Add variation
                                </button>
                              </div>
                            </CollapsibleCard>
                          )}
                        </For>
                        <Show
                          when={recordEntries(flameDescriptor.transforms).some(
                            ([tid]) => tid.startsWith('_sym__'),
                          )}
                        >
                          <CollapsibleCard
                            title={`Symmetry (${recordEntries(flameDescriptor.transforms).filter(([tid]) => tid.startsWith('_sym__')).length})`}
                            defaultOpen={true}
                          >
                            <div class={ui.symPanel}>
                              <div class={ui.symControls}>
                                <span class={ui.symControlsLabel}>Type</span>
                                <select
                                  class={ui.select}
                                  value={currentSymType()}
                                  onChange={(e) => {
                                    applySymmetry(
                                      currentSymFolds(),
                                      e.currentTarget.value as
                                        | 'rotational'
                                        | 'dihedral',
                                    )
                                  }}
                                >
                                  <option value="rotational">Rotational</option>
                                  <option value="dihedral">Dihedral</option>
                                </select>
                                <span class={ui.symControlsLabel}>Folds</span>
                                <ScrubInput
                                  label=""
                                  value={currentSymFolds()}
                                  step={1}
                                  onInput={(val: number) => {
                                    const newN = Math.max(2, Math.round(val))
                                    if (newN !== currentSymFolds()) {
                                      applySymmetry(newN, currentSymType())
                                    }
                                  }}
                                />
                              </div>

                              <div class={ui.symGallery}>
                                <For each={symTransformIds()}>
                                  {(tid) => {
                                    const transform = () =>
                                      flameDescriptor.transforms[tid]!
                                    const preAffine = () =>
                                      transform().preAffine
                                    const isReflection = () => {
                                      const a = preAffine()
                                      return (
                                        a.a === -1 &&
                                        a.d === 0 &&
                                        a.b === 0 &&
                                        a.e === 1
                                      )
                                    }
                                    const angle = () => {
                                      const a = preAffine()
                                      let v = Math.atan2(a.d, a.a)
                                      if (v < 0) v += 2 * Math.PI
                                      return v
                                    }
                                    return (
                                      <div
                                        class={ui.symItem}
                                        classList={{
                                          [ui.symItemHidden as string]:
                                            !transform().visible,
                                        }}
                                      >
                                        <span
                                          class={ui.symBadge}
                                          classList={{
                                            [ui.symBadgeReflection as string]:
                                              isReflection(),
                                          }}
                                        >
                                          {readableIds().transformLabel[tid]}
                                        </span>
                                        <div class={ui.symAngle}>
                                          <Show
                                            when={!isReflection()}
                                            fallback={
                                              <span
                                                style={{
                                                  'font-size': '0.65rem',
                                                  color: 'var(--neutral-500)',
                                                  'white-space': 'nowrap',
                                                }}
                                              >
                                                Reflection
                                              </span>
                                            }
                                          >
                                            <AngleEditor
                                              mode="inline"
                                              value={angle()}
                                              dataParameterPath={`transform.${tid}.preAffine.a`}
                                              setValue={(newAngle) => {
                                                const cos = Math.cos(newAngle)
                                                const sin = Math.sin(newAngle)
                                                setFlameDescriptor((draft) => {
                                                  const t =
                                                    draft.transforms[tid]
                                                  if (t) {
                                                    t.preAffine = {
                                                      a: cos,
                                                      b: -sin,
                                                      c: 0,
                                                      d: sin,
                                                      e: cos,
                                                      f: 0,
                                                    }
                                                  }
                                                })
                                                // Keyframe all 4 rotation components together
                                                if (
                                                  timeline &&
                                                  timeline.autoKeyframe() &&
                                                  timeline.hasAnyKeyframes(
                                                    `transform.${tid}.preAffine.a`,
                                                  )
                                                ) {
                                                  timeline.addKeyframeAtCurrentFrame(
                                                    `transform.${tid}.preAffine.a`,
                                                  )
                                                  timeline.addKeyframeAtCurrentFrame(
                                                    `transform.${tid}.preAffine.b`,
                                                  )
                                                  timeline.addKeyframeAtCurrentFrame(
                                                    `transform.${tid}.preAffine.d`,
                                                  )
                                                  timeline.addKeyframeAtCurrentFrame(
                                                    `transform.${tid}.preAffine.e`,
                                                  )
                                                }
                                              }}
                                            />
                                          </Show>
                                        </div>
                                        <div class={ui.symActions}>
                                          <button
                                            class={ui.symActionBtn}
                                            title={
                                              transform().visible
                                                ? 'Hide'
                                                : 'Show'
                                            }
                                            onClick={() => {
                                              setFlameDescriptor((draft) => {
                                                draft.transforms[tid]!.visible =
                                                  !draft.transforms[tid]!
                                                    .visible
                                              })
                                            }}
                                          >
                                            {transform().visible ? (
                                              <Eye />
                                            ) : (
                                              <EyeOff />
                                            )}
                                          </button>
                                          <button
                                            class={ui.symActionBtn}
                                            title="Remove"
                                            onClick={() => {
                                              setFlameDescriptor((draft) => {
                                                delete draft.transforms[tid]
                                              })
                                            }}
                                          >
                                            <Cross />
                                          </button>
                                        </div>
                                      </div>
                                    )
                                  }}
                                </For>
                              </div>
                            </div>
                          </CollapsibleCard>
                        </Show>
                        <Card class={ui.buttonCard}>
                          <button
                            class={ui.addFlameButton}
                            onClick={() => {
                              setFlameDescriptor((draft) => {
                                draft.transforms[generateTransformId()] =
                                  deepClone(newDefaultTransform())
                              })
                            }}
                          >
                            New transform
                          </button>
                          <button
                            class={ui.addFlameButton}
                            disabled={symTransforms().length > 0}
                            title={
                              symTransforms().length > 0
                                ? 'Symmetry already applied'
                                : 'Add 3-fold rotational symmetry'
                            }
                            onClick={() => {
                              applySymmetry(3, 'rotational')
                            }}
                          >
                            Add symmetry
                          </button>
                        </Card>
                        <CollapsibleCard title="Render">
                          <Card>
                            {/* -- Tone Mapping -- */}
                            <div class={ui.settingsGroup}>
                              <span class={ui.settingsGroupLabel}>
                                Tone Mapping
                              </span>
                              <div
                                class={ui.parameterTarget}
                                onClick={() => {
                                  setTargetedParameter('skipIters')
                                }}
                              >
                                <Slider
                                  label="Skip Iterations"
                                  value={
                                    flameDescriptor.renderSettings.skipIters
                                  }
                                  min={0}
                                  max={30}
                                  step={1}
                                  onInput={(newSkipIters) => {
                                    setFlameDescriptor((draft) => {
                                      draft.renderSettings.skipIters =
                                        newSkipIters
                                    })
                                  }}
                                  formatValue={(value) => value.toString()}
                                  dataParameterPath="skipIters"
                                  data-tour-target="skipIters-slider"
                                />
                              </div>
                              <div
                                class={ui.parameterTarget}
                                onClick={() => {
                                  setTargetedParameter('exposure')
                                }}
                              >
                                <Slider
                                  label="Exposure"
                                  value={
                                    flameDescriptor.renderSettings.exposure
                                  }
                                  min={-8}
                                  max={8}
                                  step={0.001}
                                  onInput={(newExp) => {
                                    setFlameDescriptor((draft) => {
                                      draft.renderSettings.exposure = newExp
                                    })
                                  }}
                                  formatValue={(value) =>
                                    Number(value.toFixed(6)).toString()
                                  }
                                  dataParameterPath="exposure"
                                  data-tour-target="exposure-slider"
                                />
                              </div>
                              <div
                                class={ui.parameterTarget}
                                onClick={() => {
                                  setTargetedParameter('gamma')
                                }}
                              >
                                <Slider
                                  label="Gamma"
                                  value={flameDescriptor.renderSettings.gamma}
                                  min={0.1}
                                  max={8}
                                  step={0.01}
                                  onInput={(newVal) => {
                                    setFlameDescriptor((draft) => {
                                      draft.renderSettings.gamma = newVal
                                    })
                                  }}
                                  formatValue={(value) => value.toFixed(2)}
                                  dataParameterPath="gamma"
                                  data-tour-target="gamma-slider"
                                />
                              </div>
                              <div
                                class={ui.parameterTarget}
                                onClick={() => {
                                  setTargetedParameter('contrast')
                                }}
                              >
                                <Slider
                                  label="Contrast"
                                  value={
                                    flameDescriptor.renderSettings.contrast
                                  }
                                  min={0.01}
                                  max={20}
                                  step={0.01}
                                  onInput={(newVal) => {
                                    setFlameDescriptor((draft) => {
                                      draft.renderSettings.contrast = newVal
                                    })
                                  }}
                                  formatValue={(value) => value.toFixed(2)}
                                  dataParameterPath="contrast"
                                  data-tour-target="contrast-slider"
                                />
                              </div>
                              <div
                                class={ui.parameterTarget}
                                onClick={() => {
                                  setTargetedParameter('vibrancy')
                                }}
                              >
                                <Slider
                                  label="Vibrancy"
                                  value={
                                    flameDescriptor.renderSettings.vibrancy
                                  }
                                  min={0}
                                  max={3}
                                  step={0.05}
                                  onInput={(newVibrancy) => {
                                    setFlameDescriptor((draft) => {
                                      draft.renderSettings.vibrancy =
                                        newVibrancy
                                    })
                                  }}
                                  formatValue={(value) => value.toFixed(2)}
                                  dataParameterPath="vibrancy"
                                  data-tour-target="vibrancy-slider"
                                />
                              </div>
                              <div
                                class={ui.parameterTarget}
                                onClick={() => {
                                  setTargetedParameter('highlightPower')
                                }}
                              >
                                <Slider
                                  label="Highlight Power"
                                  value={
                                    flameDescriptor.renderSettings
                                      .highlightPower
                                  }
                                  min={0}
                                  max={2}
                                  step={0.01}
                                  onInput={(newVal) => {
                                    setFlameDescriptor((draft) => {
                                      draft.renderSettings.highlightPower =
                                        newVal
                                    })
                                  }}
                                  formatValue={(value) => value.toFixed(2)}
                                  dataParameterPath="highlightPower"
                                  data-tour-target="highlightPower-slider"
                                />
                              </div>
                              <Show
                                when={
                                  (flameDescriptor.renderSettings.dimensions ??
                                    2) === 3
                                }
                              >
                                <div
                                  class={ui.parameterTarget}
                                  onClick={() => {
                                    setTargetedParameter('depthColorPower')
                                  }}
                                >
                                  <Slider
                                    label="Depth Coloring"
                                    value={
                                      flameDescriptor.renderSettings
                                        .depthColorPower ?? 0.0
                                    }
                                    min={0}
                                    max={5}
                                    step={0.05}
                                    onInput={(newVal) => {
                                      setFlameDescriptor((draft) => {
                                        draft.renderSettings.depthColorPower =
                                          newVal
                                      })
                                    }}
                                    formatValue={(value) => value.toFixed(2)}
                                    dataParameterPath="depthColorPower"
                                    data-tour-target="depthColorPower-slider"
                                  />
                                </div>
                                <div
                                  class={ui.parameterTarget}
                                  onClick={() => {
                                    setTargetedParameter('lightPower')
                                  }}
                                >
                                  <Slider
                                    label="Light Power"
                                    value={
                                      flameDescriptor.renderSettings
                                        .lightPower ?? 0.0
                                    }
                                    min={0}
                                    max={1.5}
                                    step={0.01}
                                    onInput={(newVal) => {
                                      setFlameDescriptor((draft) => {
                                        draft.renderSettings.lightPower = newVal
                                      })
                                    }}
                                    formatValue={(value) => value.toFixed(2)}
                                    dataParameterPath="lightPower"
                                    data-tour-target="lightPower-slider"
                                  />
                                </div>
                              </Show>
                              <div
                                class={ui.parameterTarget}
                                onClick={() => {
                                  setTargetedParameter(
                                    'densityEstimationQuality',
                                  )
                                }}
                              >
                                <Slider
                                  label="Filter Quality"
                                  value={
                                    flameDescriptor.renderSettings
                                      .densityEstimationQuality ?? 0.8
                                  }
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  onInput={(newVal) => {
                                    setFlameDescriptor((draft) => {
                                      draft.renderSettings.densityEstimationQuality =
                                        newVal
                                    })
                                  }}
                                  formatValue={(value) => value.toFixed(2)}
                                  dataParameterPath="densityEstimationQuality"
                                  data-tour-target="filterQuality-slider"
                                />
                              </div>
                              <div
                                class={ui.parameterTarget}
                                onClick={() => {
                                  setTargetedParameter('estimatorCurve')
                                }}
                              >
                                <Slider
                                  label="Estimator Curve"
                                  value={
                                    flameDescriptor.renderSettings
                                      .estimatorCurve ?? 0.5
                                  }
                                  min={0.1}
                                  max={1}
                                  step={0.05}
                                  onInput={(newVal) => {
                                    setFlameDescriptor((draft) => {
                                      draft.renderSettings.estimatorCurve =
                                        newVal
                                    })
                                  }}
                                  formatValue={(value) => value.toFixed(2)}
                                  dataParameterPath="estimatorCurve"
                                  data-tour-target="estimatorCurve-slider"
                                />
                              </div>
                            </div>

                            {/* -- Modes -- */}
                            <div class={ui.settingsGroup}>
                              <span class={ui.settingsGroupLabel}>Modes</span>
                              <div
                                class={ui.parameterTarget}
                                onClick={() => {
                                  setTargetedParameter('drawMode')
                                }}
                              >
                                <label
                                  class={ui.labeledInput}
                                  data-tour-target="drawMode-select"
                                >
                                  <span>
                                    <KeyframeDiamond parameterPath="drawMode" />
                                    Draw Mode
                                  </span>
                                  <select
                                    class={ui.select}
                                    value={
                                      flameDescriptor.renderSettings.drawMode
                                    }
                                    onChange={(ev) => {
                                      const mode = ev.currentTarget.value
                                      const update = () => {
                                        setFlameDescriptor((draft) => {
                                          draft.renderSettings.drawMode =
                                            mode as 'light' | 'paint'
                                        })
                                      }
                                      if ('startViewTransition' in document) {
                                        document.startViewTransition(update)
                                      } else {
                                        update()
                                      }
                                    }}
                                  >
                                    <For each={recordKeys(drawModeToImplFn)}>
                                      {(drawMode) => (
                                        <option value={drawMode}>
                                          {drawMode}
                                        </option>
                                      )}
                                    </For>
                                  </select>
                                  <span></span>
                                </label>
                              </div>
                              <div
                                class={ui.parameterTarget}
                                onClick={() => {
                                  setTargetedParameter('colorInitMode')
                                }}
                              >
                                <label
                                  class={ui.labeledInput}
                                  data-tour-target="colorInitMode-select"
                                >
                                  <span>
                                    <KeyframeDiamond parameterPath="colorInitMode" />
                                    Color Init Mode
                                  </span>
                                  <select
                                    class={ui.select}
                                    value={
                                      flameDescriptor.renderSettings
                                        .colorInitMode
                                    }
                                    onChange={(ev) => {
                                      const mode = ev.currentTarget.value
                                      const update = () => {
                                        setFlameDescriptor((draft) => {
                                          draft.renderSettings.colorInitMode =
                                            mode as
                                              | 'colorInitZero'
                                              | 'colorInitPosition'
                                        })
                                      }
                                      if ('startViewTransition' in document) {
                                        document.startViewTransition(update)
                                      } else {
                                        update()
                                      }
                                    }}
                                  >
                                    <For
                                      each={recordKeys(colorInitModeToImplFn)}
                                    >
                                      {(colorInitMode) => (
                                        <option value={colorInitMode}>
                                          {colorInitMode}
                                        </option>
                                      )}
                                    </For>
                                  </select>
                                  <span></span>
                                </label>
                              </div>
                              <div
                                class={ui.parameterTarget}
                                onClick={() => {
                                  setTargetedParameter('pointInitMode')
                                }}
                              >
                                <label
                                  class={ui.labeledInput}
                                  data-tour-target="pointInitMode-select"
                                >
                                  <span>
                                    <KeyframeDiamond parameterPath="pointInitMode" />
                                    Point Init
                                  </span>
                                  <select
                                    class={ui.select}
                                    value={
                                      flameDescriptor.renderSettings
                                        .pointInitMode
                                    }
                                    onChange={(ev) => {
                                      const mode = ev.currentTarget.value
                                      const update = () => {
                                        setFlameDescriptor((draft) => {
                                          draft.renderSettings.pointInitMode =
                                            mode as PointInitMode
                                        })
                                      }
                                      if ('startViewTransition' in document) {
                                        document.startViewTransition(update)
                                      } else {
                                        update()
                                      }
                                    }}
                                  >
                                    <For
                                      each={recordKeys(
                                        (flameDescriptor.renderSettings
                                          .dimensions ?? 2) === 3
                                          ? pointInitMode3DToImplFn
                                          : pointInitModeToImplFn,
                                      )}
                                    >
                                      {(pointInitMode) => (
                                        <option value={pointInitMode}>
                                          {pointInitMode}
                                        </option>
                                      )}
                                    </For>
                                  </select>
                                  <span></span>
                                </label>
                              </div>
                              <div
                                class={ui.parameterTarget}
                                onClick={() => {
                                  setTargetedParameter('backgroundColor')
                                }}
                              >
                                <label
                                  class={ui.labeledInput}
                                  data-tour-target="backgroundColor-picker"
                                >
                                  <span>
                                    <KeyframeDiamond parameterPath="backgroundColor" />
                                    Background Color
                                  </span>
                                  <ColorPicker
                                    value={
                                      flameDescriptor.renderSettings
                                        .backgroundColor
                                        ? vec3f(
                                            ...flameDescriptor.renderSettings
                                              .backgroundColor,
                                          )
                                        : undefined
                                    }
                                    setValue={(newBgColor) => {
                                      setFlameDescriptor((draft) => {
                                        draft.renderSettings.backgroundColor =
                                          newBgColor
                                      })
                                    }}
                                  />
                                </label>
                              </div>
                              <Show
                                when={
                                  flameDescriptor.renderSettings
                                    .backgroundColor !== undefined
                                }
                                fallback={<span class={ui.noSelect} />}
                              >
                                <Button
                                  onClick={() => {
                                    setFlameDescriptor((draft) => {
                                      delete draft.renderSettings
                                        .backgroundColor
                                    })
                                  }}
                                >
                                  Auto
                                </Button>
                              </Show>
                            </div>

                            {/* -- Palette -- */}
                            <div
                              style={{ 'grid-column': '1 / -1' }}
                              title={
                                selectedPaletteId() === ''
                                  ? 'Select a palette in the gallery to enable these options'
                                  : undefined
                              }
                            >
                              <div
                                class={ui.settingsGroup}
                                style={{
                                  opacity: selectedPaletteId() !== '' ? 1 : 0.4,
                                  'pointer-events':
                                    selectedPaletteId() !== ''
                                      ? 'auto'
                                      : 'none',
                                }}
                              >
                                <span class={ui.settingsGroupLabel}>
                                  Palette
                                </span>
                                <div
                                  class={ui.parameterTarget}
                                  onClick={() => {
                                    setTargetedParameter('paletteSpeed')
                                  }}
                                >
                                  <Slider
                                    label="Palette Speed"
                                    value={
                                      flameDescriptor.renderSettings
                                        .paletteSpeed
                                    }
                                    min={0}
                                    max={10}
                                    step={0.1}
                                    onInput={(newVal) => {
                                      setFlameDescriptor((draft) => {
                                        draft.renderSettings.paletteSpeed =
                                          newVal
                                      })
                                    }}
                                    formatValue={(value) => value.toFixed(1)}
                                    dataParameterPath="paletteSpeed"
                                    data-tour-target="paletteSpeed-slider"
                                  />
                                </div>
                                <div
                                  class={ui.parameterTarget}
                                  onClick={() => {
                                    setTargetedParameter('paletteMode')
                                  }}
                                >
                                  <label
                                    class={ui.labeledInput}
                                    data-tour-target="paletteMode-select"
                                  >
                                    <span>Palette Mode</span>
                                    <select
                                      class={ui.select}
                                      value={
                                        flameDescriptor.renderSettings
                                          .paletteMode ?? 0
                                      }
                                      onChange={(ev) => {
                                        const mode = parseInt(
                                          ev.currentTarget.value,
                                        ) as 0 | 1
                                        setFlameDescriptor((draft) => {
                                          draft.renderSettings.paletteMode =
                                            mode
                                        })
                                      }}
                                    >
                                      <option value={0}>Density Shift</option>
                                      <option value={1}>
                                        Hue Rotation (flam3)
                                      </option>
                                    </select>
                                    <span></span>
                                  </label>
                                </div>
                                <div
                                  class={ui.parameterTarget}
                                  onClick={() => {
                                    setTargetedParameter('palettePhase')
                                  }}
                                >
                                  <Slider
                                    label="Palette Phase"
                                    value={
                                      flameDescriptor.renderSettings
                                        .palettePhase
                                    }
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    onInput={(newVal) => {
                                      setFlameDescriptor((draft) => {
                                        draft.renderSettings.palettePhase =
                                          newVal
                                      })
                                    }}
                                    formatValue={(value) => value.toFixed(2)}
                                    dataParameterPath="palettePhase"
                                    data-tour-target="palettePhase-slider"
                                  />
                                </div>
                              </div>
                            </div>
                          </Card>
                        </CollapsibleCard>
                        <CollapsibleCard title="Metadata" defaultOpen={false}>
                          <Card>
                            <div
                              style={{
                                display: 'flex',
                                'flex-direction': 'column',
                                gap: '0.5rem',
                                width: '100%',
                                'grid-column': '1 / -1',
                              }}
                            >
                              <div>
                                <label class={ui.metadataLabel}>Name</label>
                                <input
                                  class={ui.metadataInput}
                                  type="text"
                                  placeholder="Flame Name"
                                  value={flameDescriptor.metadata?.name ?? ''}
                                  onInput={(e) => {
                                    setFlameDescriptor((draft) => {
                                      if (!draft.metadata) {
                                        draft.metadata = {
                                          name: '',
                                          description: '',
                                          author: '',
                                        }
                                      }
                                      draft.metadata.name =
                                        e.currentTarget.value
                                    })
                                  }}
                                />
                              </div>
                              <div>
                                <label class={ui.metadataLabel}>
                                  Description
                                </label>
                                <textarea
                                  class={ui.metadataTextarea}
                                  placeholder="Description"
                                  value={
                                    flameDescriptor.metadata?.description ?? ''
                                  }
                                  onInput={(e) => {
                                    setFlameDescriptor((draft) => {
                                      if (!draft.metadata) {
                                        draft.metadata = {
                                          name: '',
                                          description: '',
                                          author: '',
                                        }
                                      }
                                      draft.metadata.description =
                                        e.currentTarget.value
                                    })
                                  }}
                                />
                              </div>
                              <div>
                                <label class={ui.metadataLabel}>Author</label>
                                <input
                                  class={ui.metadataInput}
                                  type="text"
                                  placeholder="Author"
                                  value={flameDescriptor.metadata?.author ?? ''}
                                  onInput={(e) => {
                                    setFlameDescriptor((draft) => {
                                      if (!draft.metadata) {
                                        draft.metadata = {
                                          name: '',
                                          description: '',
                                          author: '',
                                        }
                                      }
                                      draft.metadata.author =
                                        e.currentTarget.value
                                    })
                                  }}
                                />
                              </div>
                            </div>
                          </Card>
                        </CollapsibleCard>
                      </Show>
                    </>
                  }
                >
                  <BlendFlameGallery
                    onSelect={(flame) => {
                      prevBlendFlame = undefined
                      setBlendFlame(deepClone(flame))
                      setShowBlendGallery(false)
                    }}
                    onPreviewBlend={handlePreviewBlend}
                    onPreviewName={(name) => setHoveredBlendName(name)}
                    onClose={() => {
                      handlePreviewBlend(null)
                      setHoveredBlendName(null)
                      setShowBlendGallery(false)
                    }}
                  />
                </Show>
              </div>
            </div>
          </Show>
          <FloatingActions
            disabled={
              animationExportRunning() || exportProgress() !== undefined
            }
            initialLeft={floatingLeft()}
            initialTop={floatingTop()}
            onLoadFlame={() => {
              if (timeline.isPlaying()) timeline.pause()

              void showLoadFlameModal()
            }}
            onSaveForLater={async () => {
              const tracks = timeline.tracks()
              const success = saveRecentFlame(
                flameDescriptor,
                undefined,
                tracks,
                false,
              )
              if (!success) {
                const oldest = getOldestRecentFlame()
                const oldestName = oldest?.name || 'Flame'
                const confirmed = await _requestModal<boolean>({
                  content: ({ respond }) => (
                    <ConfirmOverwriteRecentModal
                      oldestName={oldestName}
                      respond={respond}
                    />
                  ),
                })
                if (confirmed) {
                  saveRecentFlame(flameDescriptor, undefined, tracks, true)
                  showToast(
                    tracks.length > 0
                      ? 'Flame + animation saved (replaced oldest)'
                      : 'Flame saved (replaced oldest)',
                  )
                }
              } else {
                showToast(
                  tracks.length > 0
                    ? 'Flame + animation saved for later'
                    : 'Flame saved for later',
                )
              }
            }}
            onRender={() => {
              if (timeline.isPlaying()) timeline.pause()

              void showExportPngDialog()
            }}
            onQuickExport={quickExport}
            onShareLink={() => {
              if (timeline.isPlaying()) timeline.pause()

              void showShareLinkModal()
            }}
            onShareDiscord={shareToDiscord}
            onLogoFavicon={showLogoFaviconGenerator}
            onRandomizeColors={() => {
              setFlameDescriptor((draft) => {
                draft.transforms = randomizeAllColors(draft.transforms)
              })
            }}
            hideDiceButtons={hideDiceButtons}
            setHideDiceButtons={setHideDiceButtons}
            animationEnabled={animationEnabled}
            setAnimationEnabled={(v) => {
              if (IS_DEV) console.info('[anim] floating toggle →', v)
              setAnimationEnabled(v)
            }}
            showTimeline={showTimeline}
            setShowTimeline={setShowTimeline}
            adaptiveFilterEnabled={adaptiveFilterEnabled}
            setAdaptiveFilterEnabled={setAdaptiveFilterEnabled}
            isPlaying={() => timeline.isPlaying()}
            togglePlay={() => {
              if (!animationEnabled()) {
                setAnimationEnabled(true)
              }
              timeline.togglePlay()
            }}
            qualityPreset={qualityPreset}
            setQualityPreset={(key) => {
              if (IS_DEV) {
                console.info(
                  '[App] setQualityPreset (floating)',
                  `key=${key}`,
                  `current=${qualityPreset()}`,
                )
              }
              setQualityPreset(key as QualityPreset)
            }}
            accumulatedPointCount={accumulatedPointCount}
            qualityPointCountLimit={qualityPointCountLimit()}
            dimensions={() => flameDescriptor.renderSettings.dimensions ?? 2}
            setDimensions={(v) => {
              const current = flameDescriptor.renderSettings.dimensions ?? 2
              if (v === current) return
              if (current === 3) {
                stashedFlame3D = deepClone(flameDescriptor)
              } else {
                stashedFlame2D = deepClone(flameDescriptor)
              }
              const restored =
                v === 3
                  ? (stashedFlame3D ?? example34)
                  : (stashedFlame2D ?? initExample)
              history.replace(deepClone(restored))
            }}
          />
          <SpotlightTour tourContext={tourContext} />
          <BenchmarkButton onClick={createShowBenchmark()} />
          <SoftwareVersion
            showHelp={createShowHelp(
              quickPickerMode,
              setQuickPickerMode,
              sidebarLayoutMode,
              setSidebarLayoutMode,
              isCompact,
              setCompact,
              theme,
              setTheme,
              IS_DEV ? () => setDevCrashTest(true) : undefined,
              () => props.hardwareTier ?? null,
              props.onHardwareTierChange,
            )}
          />
          <Show when={devCrashTest()}>
            {(() => {
              throw new Error('[DEV] Injected crash from About panel')
            })()}
          </Show>
        </Dropzone>
      </TimelineContextProvider>
    </ChangeHistoryContextProvider>
  )
}
