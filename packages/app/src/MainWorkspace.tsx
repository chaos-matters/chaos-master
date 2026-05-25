import { createEffect, createMemo, createSignal, For, onMount, Show, } from 'solid-js'
import { createStore } from 'solid-js/store'
import { Dynamic } from 'solid-js/web'
import { vec2f, vec3f, vec4f } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import { useKeyframeTarget } from '@/contexts/KeyframeTargetContext'
import { useToast } from '@/contexts/ToastContext'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { createDragHandler } from '@/utils/createDragHandler'
import { recordEntries, recordKeys } from '@/utils/record'
import ui from './App.module.css'
import { AffineEditor } from './components/AffineEditor/AffineEditor'
import { Button } from './components/Button/Button'
import { CollapsibleCard } from './components/CollapsibleCard/CollapsibleCard'
import { ColorPicker } from './components/ColorPicker/ColorPicker'
import { Card } from './components/ControlCard/ControlCard'
import { DebugOverlay } from './components/DebugOverlay'
import { DiceButton } from './components/DiceButton/DiceButton'
import { Dropzone } from './components/Dropzone/Dropzone'
import { createExportPngDialog } from './components/ExportPngDialog/ExportPngDialog'
import { FlameColorEditor, handleColor, } from './components/FlameColorEditor/FlameColorEditor'
import { FloatingActions } from './components/FloatingActions/FloatingActions'
import { createShowHelp } from './components/HelpModal/HelpModal'
import { createLoadFlame } from './components/LoadFlameModal/LoadFlameModal'
import { createLogoFaviconGenerator } from './components/LogoFaviconGenerator/LogoFaviconGenerator'
import { PaletteSelector } from './components/PaletteSelector/PaletteSelector'
import { ProgressBar } from './components/ProgressBar/ProgressBar'
import { getPresetFromQuality, qualityPresets, } from './components/Quality/QualityPresets'
import { QuickVariationPicker } from './components/QuickVariationPicker/QuickVariationPicker'
import { createShareLinkModal } from './components/ShareLinkModal/ShareLinkModal'
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
import { Flam3 } from './flame/Flam3'
import { pointInitModeToImplFn } from './flame/pointInitMode'
import { random01, randomizeAllColors, randomizeVariationParams, } from './flame/randomize'
import { accumulatedPointCount, animationExportCancel, animationExportProgress, animationExportRunning, exportProgress, exportQuality, qualityPointCountLimit, setCurrentQuality, setQualityPointCountLimit, } from './flame/renderStats'
import { MAX_CAMERA_ZOOM_VALUE, MIN_CAMERA_ZOOM_VALUE, } from './flame/schema/flameSchema'
import { generateTransformId, generateVariationId, } from './flame/transformFunction'
import { isParametricVariation, isParametricVariationType, isVariationType, transformVariations, } from './flame/variations'
import { getNormalizedVariationName, getParamsEditor, getVariationDefault, } from './flame/variations/utils'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Cross, Eye, EyeOff, Menu, Plus, Share } from './icons'
import { AutoCanvas } from './lib/AutoCanvas'
import { createAnimationExport } from './utils/animationExport'
import { deepClone } from './utils/clone'
import { createStoreHistory } from './utils/createStoreHistory'
import { persistentSignal } from './utils/persistentSignal'
import { buildReadableIds } from './utils/readableIds'
import { saveRecentFlame } from './utils/recentFlames'
import { sum } from './utils/sum'
import { createTimelineState, resolveKeyframeValue } from './utils/timeline'
import { useAppDragAndDrop } from './utils/useAppDragAndDrop'
import { useKeyboardShortcuts } from './utils/useKeyboardShortcuts'
import type { Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { QualityPreset } from './components/Quality/QualityPresets'
import type { QuickPickerMode } from './components/QuickVariationPicker/QuickVariationPicker'
import type { TourContext } from './components/SpotlightTour/tourTypes'
import type { ColorInitMode } from './flame/colorInitMode'
import type { ColorMap, Palette } from './flame/colorMap'
import type { DrawMode } from './flame/drawMode'
import type { PointInitMode } from './flame/pointInitMode'
import type { FlameDescriptor, TransformFunction, TransformId, VariationId, } from './flame/schema/flameSchema'
import type { TransformVariationType } from './flame/variations'
import type { AnimationExportConfig } from './utils/animationExport'
import type { SharePayload } from './utils/jsonQueryParam'

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

function newDefaultTransform(): TransformFunction {
  return {
    probability: 1,
    color: { x: 0, y: 0 },
    preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    visible: true,
    variations: {
      [generateVariationId()]: getVariationDefault('linear', 1.0),
    },
  }
}

export type ExportImageType = (canvas: HTMLCanvasElement) => void

export type AppProps = {
  flameFromQuery?: SharePayload
  flameFromWelcome?: () => FlameDescriptor | undefined
  resetFlameFromWelcome?: () => void
}

export function MainWorkspace(props: AppProps) {
  const { theme, setTheme } = useTheme()
  const { targetedParameter, setTargetedParameter } = useKeyframeTarget()

  createEffect(() => {
    const path = targetedParameter()
    if (path) {
      // Find the element with the matching data-parameter-path
      const el = document.querySelector(`[data-parameter-path="${path}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  })

  const [qualityPreset, setQualityPreset] = createSignal<QualityPreset>(
    getPresetFromQuality(DEFAULT_QUALITY),
  )
  const [pixelRatio, setPixelRatio] = createSignal(DEFAULT_RESOLUTION)
  const [onExportImage, setOnExportImage] = createSignal<ExportImageType>()
  const [adaptiveFilterEnabled, setAdaptiveFilterEnabled] = createSignal(true)
  const [animationEnabled, setAnimationEnabled] = createSignal(true)
  const [hideDiceButtons, setHideDiceButtons] = createSignal(false)
  const { toastMessage, showToast } = useToast()
  const SIDEBAR_RESIZABLE = false
  const { isCompact, toggleCompact } = useCompactMode()
  const [showSidebar, setShowSidebar] = createSignal(true)
  const [sidebarHidden, setSidebarHidden] = createSignal(false)
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
    if (mq.matches && !isCompact()) toggleCompact()
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
      if (e.matches && !isCompact()) toggleCompact()
    }
    mq.addEventListener('change', handler)
    return () => {
      mq.removeEventListener('change', handler)
    }
  })
  const [showTimeline, setShowTimeline] = createSignal(true)
  const [selectedPaletteId, setSelectedPaletteId] = createSignal<string>('')
  const [selectedPalette, setSelectedPalette] = createSignal<
    Palette | undefined
  >(undefined)
  const [prePaletteColors, setPrePaletteColors] = createSignal<
    Record<string, { x: number; y: number }>
  >({})
  const [flameDescriptor, setFlameDescriptor, history] = createStoreHistory(
    createStore(
      structuredClone(
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
      history.replace(structuredClone(newFlame))
      props.resetFlameFromWelcome?.()
    }
  })

  const totalProbability = createMemo(() =>
    sum(Object.values(flameDescriptor.transforms).map((f) => f.probability)),
  )
  const {
    loadModalIsOpen,
    showLoadFlameModal,
    loadedAnimation,
    setLoadedAnimation,
    clearLoadedAnimation,
  } = createLoadFlame(history)
  const { showVariationSelector, varSelectorModalIsOpen } =
    createVariationSelector(history)

  // Quick variation picker state
  const [quickPickerMode, setQuickPickerMode] =
    persistentSignal<QuickPickerMode>('quick-picker-mode', 'list')
  type QuickPickState = {
    tid: TransformId
    vid: VariationId
    type: TransformVariationType
  } | null
  const [quickPickState, setQuickPickState] = createSignal<QuickPickState>(null)
  const [hoveredVariationType, setHoveredVariationType] =
    createSignal<TransformVariationType | null>(null)

  // Compute a temporary flame with the hovered variation swapped in.
  // Falls back to the real flameDescriptor when nothing is hovered.
  const effectiveFlame = createMemo<FlameDescriptor>(() => {
    const hovered = hoveredVariationType()
    const state = quickPickState()
    if (!hovered || !state) return flameDescriptor as unknown as FlameDescriptor
    try {
      const clone: FlameDescriptor = deepClone(flameDescriptor)
      const existingVar = clone.transforms[state.tid]?.variations[state.vid]
      if (existingVar) {
        clone.transforms[state.tid]!.variations[state.vid] = structuredClone(
          getVariationDefault(hovered, existingVar.weight),
        )
      }
      return clone
    } catch {
      return flameDescriptor as unknown as FlameDescriptor
    }
  })

  const finalRenderInterval = () =>
    loadModalIsOpen() || varSelectorModalIsOpen()
      ? Infinity
      : onExportImage()
        ? 0
        : DEFAULT_RENDER_INTERVAL_MS

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

  createEffect(() => {
    setTheme(
      flameDescriptor.renderSettings.drawMode === 'light' ? 'dark' : 'light',
    )
  })

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

  const { showShareLinkModal } = createShareLinkModal(
    flameDescriptor,
    () => timeline.tracks(),
    () => timeline.config(),
  )

  function startAnimationExport(
    config: AnimationExportConfig,
    _placeholderCanvas: HTMLCanvasElement,
  ) {
    const canvas = document.querySelector<HTMLCanvasElement>(`.${ui.canvas}`)
    if (!canvas) {
      showToast('Canvas not found')
      return
    }

    const { promise } = createAnimationExport(
      config,
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
      // eslint-disable-next-line @typescript-eslint/use-unknown-in-catch-callback-variable
      .catch((err) => {
        console.error('Animation export failed:', err)
        showToast('Animation export failed')
      })
  }

  const { showExportPngDialog, quickExport } = createExportPngDialog(
    flameDescriptor,
    () => timeline,
    pixelRatio,
    setPixelRatio,
    setOnExportImage,
    setFlameDescriptor,
    () => selectedPalette(),
    startAnimationExport,
  )

  const { showLogoFaviconGenerator } = createLogoFaviconGenerator(
    flameDescriptor,
    () => selectedPalette(),
    history,
  )

  const tourContext: TourContext = {
    setSidebarOpen: setShowSidebar,
    sidebarOpen: showSidebar,
    setTimelineOpen: setShowTimeline,
    timelineOpen: showTimeline,
    setAnimationEnabled,
    animationEnabled,
    openModal: (name) => {
      switch (name) {
        case 'loadFlame':
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          showLoadFlameModal()
          break
        case 'exportPng':
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          showExportPngDialog()
          break
        case 'shareLink':
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          showShareLinkModal()
          break
      }
    },
    closeCurrentModal: () => {},
    scrollToTarget: (selector) => {
      document
        .querySelector(selector)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
    history.replace(structuredClone(data.flame))

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
        if (animationEnabled()) {
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
        if (animationEnabled()) {
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
        if (animationEnabled()) {
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
        } else if (
          isParametricVariationType(variation.type as TransformVariationType)
        ) {
          // Params not initialized yet — fall back to defaults
          const vType = variation.type as TransformVariationType
          const vDef = transformVariations[vType] as {
            paramDefaults: Record<string, number>
          }
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
            | undefined)!.rotation = value as number
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
    if (animationEnabled() && timeline.isPlaying()) {
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
    if (animationEnabled() && timeline.isPlaying()) {
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
      const togglePaintMode = () => {
        setFlameDescriptor((draft) => {
          draft.renderSettings.drawMode =
            draft.renderSettings.drawMode === 'light' ? 'paint' : 'light'
        })
      }
      if ('startViewTransition' in document) {
        document.startViewTransition(togglePaintMode)
      } else {
        togglePaintMode()
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
            >
              <AutoCanvas class={ui.canvas} pixelRatio={pixelRatio()}>
                <WheelZoomCamera2D
                  zoom={[effectiveZoom, setFlameZoom]}
                  position={[effectivePosition, setFlamePosition]}
                  interactive={() => !timeline.isPlaying()}
                >
                  <Flam3
                    quality={exportQuality() ?? qualityPresets[qualityPreset()]}
                    pointCountPerBatch={DEFAULT_POINT_COUNT}
                    adaptiveFilterEnabled={adaptiveFilterEnabled()}
                    animationEnabled={animationEnabled()}
                    flameDescriptor={effectiveFlame()}
                    renderInterval={finalRenderInterval()}
                    onExportImage={onExportImage()}
                    edgeFadeColor={
                      showSidebar() ? EDGE_FADE_COLOR[theme()] : vec4f(0)
                    }
                    setCurrentQuality={(fn) => setCurrentQuality(() => fn)}
                    setQualityPointCountLimit={(fn) =>
                      setQualityPointCountLimit(() => fn)
                    }
                    palette={() => selectedPalette()}
                  />
                </WheelZoomCamera2D>
              </AutoCanvas>
              <Show when={hoveredVariationType()} keyed>
                {(hv) => (
                  <div class={ui.hoverPreviewBadge}>
                    Previewing: {getNormalizedVariationName(hv)}
                  </div>
                )}
              </Show>
              <Show when={toastMessage()}>
                {(msg) => <div class={ui.toast}>{msg()}</div>}
              </Show>
              <ProgressBar />
              <div class={ui.bottomBar}>
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
                  />
                  <Show when={isMobile()}>
                    <button
                      class={ui.sidebarToggle}
                      onClick={() => setSidebarHidden((p) => !p)}
                      aria-label="Toggle sidebar"
                    >
                      <Menu />
                    </button>
                  </Show>
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
          <Show when={IS_DEV}>
            <DebugOverlay
              animationEnabled={animationEnabled()}
              flameDescriptor={flameDescriptor}
            />
          </Show>

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
                        : '⏸ Tap to stop animation'}
                  </span>
                  <Show when={animationExportRunning()}>
                    <button
                      class={ui.stopExportButton}
                      onClick={(e) => {
                        e.stopPropagation()
                        const cancelFn = animationExportCancel()
                        if (cancelFn) cancelFn()
                      }}
                      title="Stop rendering"
                    >
                      <svg
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        width="16"
                        height="16"
                      >
                        <path d="M3 3h10v10H3V3z" />
                      </svg>
                    </button>
                  </Show>
                </div>
              </Show>
              <div class={ui.sidebarScroll} ref={sidebarScrollRef}>
                <Show when={quickPickState()} keyed>
                  {(state) => (
                    <QuickVariationPicker
                      currentType={
                        flameDescriptor.transforms[state.tid]?.variations[
                          state.vid
                        ]?.type ?? state.type
                      }
                      onSelect={(newType) => {
                        setFlameDescriptor((draft) => {
                          const existingVar =
                            draft.transforms[state.tid]?.variations[state.vid]
                          if (existingVar) {
                            draft.transforms[state.tid]!.variations[state.vid] =
                              structuredClone(
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
                      onHoverType={(type) => setHoveredVariationType(type)}
                      onHoverClear={() => setHoveredVariationType(null)}
                      mode={quickPickerMode()}
                      onModeChange={setQuickPickerMode}
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
                  <For each={recordEntries(flameDescriptor.transforms)}>
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
                                  vec2f(transform.color.x, transform.color.y),
                                ),
                              }}
                            >
                              <circle class={ui.variationButtonColorCircle} />
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
                                if (recordKeys(draft.transforms).length === 1) {
                                  draft.transforms[tid] = structuredClone(
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
                                            draft.transforms[tid]!.preAffine =
                                              newValue.transform.preAffine
                                            draft.transforms[tid]!.variations[
                                              vid
                                            ] = newValue.variation
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
                                          {readableIds().variationLabel[vid]}
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
                                    onClick={() => {
                                      setTargetedParameter(`${tid}.${vid}`)
                                    }}
                                  >
                                    <Slider
                                      value={variation.weight}
                                      min={0}
                                      max={1}
                                      step={0.001}
                                      dataParameterPath={`${tid}.${vid}`}
                                      data-tour-target="variation-weight"
                                      onInput={(weight) => {
                                        setFlameDescriptor((draft) => {
                                          draft.transforms[tid]!.variations[
                                            vid
                                          ]!.weight = weight
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
                                            draft.transforms[tid]!.variations[
                                              vid
                                            ]!
                                          v.weight = random01()
                                          const params =
                                            randomizeVariationParams(v.type)
                                          if (params) {
                                            ;(
                                              v as {
                                                params?: Record<string, number>
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
                                          draft.transforms[tid]!.variations[
                                            vid
                                          ]!
                                        v.visible = !v.visible
                                      })
                                    }}
                                  >
                                    {variation.visible ? <Eye /> : <EyeOff />}
                                  </button>
                                  <button
                                    class={ui.deleteVariationButton}
                                    onClick={() => {
                                      setFlameDescriptor((draft) => {
                                        if (
                                          recordKeys(
                                            draft.transforms[tid]!.variations,
                                          ).length === 1
                                        ) {
                                          draft.transforms[tid]!.variations[
                                            vid
                                          ] = structuredClone(
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
                                    isParametricVariation(variation) &&
                                    variation
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
                                        setTargetedParameter(`${tid}.${vid}`)
                                      }}
                                    >
                                      <Dynamic
                                        {...getParamsEditor(variation)}
                                        dataParameterPath={`${tid}.${vid}`}
                                        setValue={(value) => {
                                          setFlameDescriptor((draft) => {
                                            const variationDraft =
                                              draft.transforms[tid]?.variations[
                                                vid
                                              ]
                                            if (
                                              variationDraft === undefined ||
                                              !isParametricVariation(
                                                variationDraft,
                                              )
                                            ) {
                                              throw new Error(
                                                `Unreachable code`,
                                              )
                                            }
                                            variationDraft.params = value
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
                                ] = structuredClone(
                                  getVariationDefault('linear', 1),
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
                  <Card class={ui.buttonCard}>
                    <button
                      class={ui.addFlameButton}
                      onClick={() => {
                        setFlameDescriptor((draft) => {
                          draft.transforms[generateTransformId()] =
                            structuredClone(newDefaultTransform())
                        })
                      }}
                    >
                      New transform
                    </button>
                  </Card>
                  <CollapsibleCard title="Render">
                    <Card>
                      <div
                        class={ui.parameterTarget}
                        onClick={() => {
                          setTargetedParameter('skipIters')
                        }}
                      >
                        <Slider
                          label="Skip Iterations"
                          value={flameDescriptor.renderSettings.skipIters}
                          min={0}
                          max={30}
                          step={1}
                          onInput={(newSkipIters) => {
                            setFlameDescriptor((draft) => {
                              draft.renderSettings.skipIters = newSkipIters
                            })
                          }}
                          formatValue={(value) => value.toString()}
                          dataParameterPath="skipIters"
                        />
                      </div>
                      <div
                        class={ui.parameterTarget}
                        onClick={() => {
                          setTargetedParameter('drawMode')
                        }}
                      >
                        <label class={ui.labeledInput}>
                          <span>
                            <KeyframeDiamond parameterPath="drawMode" />
                            Draw Mode
                          </span>
                          <select
                            class={ui.select}
                            value={flameDescriptor.renderSettings.drawMode}
                            onChange={(ev) => {
                              const mode = ev.currentTarget.value as DrawMode
                              const update = () => {
                                setFlameDescriptor((draft) => {
                                  draft.renderSettings.drawMode = mode
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
                                <option value={drawMode}>{drawMode}</option>
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
                        <label class={ui.labeledInput}>
                          <span>
                            <KeyframeDiamond parameterPath="colorInitMode" />
                            Color Init Mode
                          </span>
                          <select
                            class={ui.select}
                            value={flameDescriptor.renderSettings.colorInitMode}
                            onChange={(ev) => {
                              const mode = ev.currentTarget
                                .value as ColorInitMode
                              const update = () => {
                                setFlameDescriptor((draft) => {
                                  draft.renderSettings.colorInitMode = mode
                                })
                              }
                              if ('startViewTransition' in document) {
                                document.startViewTransition(update)
                              } else {
                                update()
                              }
                            }}
                          >
                            <For each={recordKeys(colorInitModeToImplFn)}>
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
                        <label class={ui.labeledInput}>
                          <span>
                            <KeyframeDiamond parameterPath="pointInitMode" />
                            Point Init
                          </span>
                          <select
                            class={ui.select}
                            value={flameDescriptor.renderSettings.pointInitMode}
                            onChange={(ev) => {
                              const mode = ev.currentTarget
                                .value as PointInitMode
                              const update = () => {
                                setFlameDescriptor((draft) => {
                                  draft.renderSettings.pointInitMode = mode
                                })
                              }
                              if ('startViewTransition' in document) {
                                document.startViewTransition(update)
                              } else {
                                update()
                              }
                            }}
                          >
                            <For each={recordKeys(pointInitModeToImplFn)}>
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
                          setTargetedParameter('exposure')
                        }}
                      >
                        <Slider
                          label="Exposure"
                          value={flameDescriptor.renderSettings.exposure}
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
                          value={flameDescriptor.renderSettings.vibrancy}
                          min={0}
                          max={3}
                          step={0.05}
                          onInput={(newVibrancy) => {
                            setFlameDescriptor((draft) => {
                              draft.renderSettings.vibrancy = newVibrancy
                            })
                          }}
                          formatValue={(value) => value.toFixed(2)}
                          dataParameterPath="vibrancy"
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
                          value={flameDescriptor.renderSettings.contrast}
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
                          value={flameDescriptor.renderSettings.highlightPower}
                          min={0}
                          max={2}
                          step={0.01}
                          onInput={(newVal) => {
                            setFlameDescriptor((draft) => {
                              draft.renderSettings.highlightPower = newVal
                            })
                          }}
                          formatValue={(value) => value.toFixed(2)}
                          dataParameterPath="highlightPower"
                        />
                      </div>
                      <div
                        class={ui.parameterTarget}
                        onClick={() => {
                          setTargetedParameter('paletteSpeed')
                        }}
                      >
                        <Slider
                          label="Palette Speed"
                          value={flameDescriptor.renderSettings.paletteSpeed}
                          min={0}
                          max={30}
                          step={0.1}
                          onInput={(newVal) => {
                            setFlameDescriptor((draft) => {
                              draft.renderSettings.paletteSpeed = newVal
                            })
                          }}
                          formatValue={(value) => value.toFixed(1)}
                          dataParameterPath="paletteSpeed"
                        />
                      </div>
                      <div
                        class={ui.parameterTarget}
                        onClick={() => {
                          setTargetedParameter('paletteMode')
                        }}
                      >
                        <label class={ui.labeledInput}>
                          <span>Palette Mode</span>
                          <select
                            class={ui.select}
                            value={
                              flameDescriptor.renderSettings.paletteMode ?? 0
                            }
                            onChange={(ev) => {
                              const mode = parseInt(ev.currentTarget.value) as
                                | 0
                                | 1
                              setFlameDescriptor((draft) => {
                                draft.renderSettings.paletteMode = mode
                              })
                            }}
                          >
                            <option value={0}>Density Shift</option>
                            <option value={1}>Hue Rotation (flam3)</option>
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
                          value={flameDescriptor.renderSettings.palettePhase}
                          min={0}
                          max={1}
                          step={0.05}
                          onInput={(newVal) => {
                            setFlameDescriptor((draft) => {
                              draft.renderSettings.palettePhase = newVal
                            })
                          }}
                          formatValue={(value) => value.toFixed(2)}
                          dataParameterPath="palettePhase"
                        />
                      </div>
                      <div
                        class={ui.parameterTarget}
                        onClick={() => {
                          setTargetedParameter('densityEstimationQuality')
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
                        />
                      </div>
                      <div
                        class={ui.parameterTarget}
                        onClick={() => {
                          setTargetedParameter('backgroundColor')
                        }}
                      >
                        <label class={ui.labeledInput}>
                          <span>
                            <KeyframeDiamond parameterPath="backgroundColor" />
                            Background Color
                          </span>
                          <ColorPicker
                            value={
                              flameDescriptor.renderSettings.backgroundColor
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
                          flameDescriptor.renderSettings.backgroundColor !==
                          undefined
                        }
                        fallback={<span class={ui.noSelect} />}
                      >
                        <Button
                          onClick={() => {
                            setFlameDescriptor((draft) => {
                              delete draft.renderSettings.backgroundColor
                            })
                          }}
                        >
                          Auto
                        </Button>
                      </Show>
                    </Card>
                  </CollapsibleCard>
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
            onLoadFlame={showLoadFlameModal}
            onSaveForLater={() => {
              const tracks = timeline.tracks()
              saveRecentFlame(
                flameDescriptor,
                undefined,
                tracks.length > 0 ? tracks : undefined,
              )
              showToast(
                tracks.length > 0
                  ? 'Flame + animation saved for later'
                  : 'Flame saved for later',
              )
            }}
            onRender={showExportPngDialog}
            onQuickExport={quickExport}
            onShareLink={showShareLinkModal}
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
          />
          <SpotlightTour tourContext={tourContext} />
          <SoftwareVersion
            showHelp={createShowHelp(
              quickPickerMode,
              setQuickPickerMode,
              sidebarLayoutMode,
              setSidebarLayoutMode,
              isCompact,
              toggleCompact,
            )}
          />
        </Dropzone>
      </TimelineContextProvider>
    </ChangeHistoryContextProvider>
  )
}
