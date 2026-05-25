import { batch, createEffect, createMemo, createResource, createSignal, ErrorBoundary, For, onCleanup, onMount, Show, Suspense, } from 'solid-js'
import { createStore } from 'solid-js/store'
import { Dynamic } from 'solid-js/web'
import { vec2f, vec3f, vec4f } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import { KeyframeTargetProvider, useKeyframeTarget, } from '@/contexts/KeyframeTargetContext'
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
import { AppCrashed, WebgpuNotSupported, } from './components/ErrorHandling/ErrorHandling'
import { createExportPngDialog } from './components/ExportPngDialog/ExportPngDialog'
import { FlameColorEditor, handleColor, } from './components/FlameColorEditor/FlameColorEditor'
import { FloatingActions } from './components/FloatingActions/FloatingActions'
import { createShowHelp } from './components/HelpModal/HelpModal'
import { createLoadFlame } from './components/LoadFlameModal/LoadFlameModal'
import { createLogoFaviconGenerator } from './components/LogoFaviconGenerator/LogoFaviconGenerator'
import { Modal } from './components/Modal/Modal'
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
import { WelcomeScreen } from './components/WelcomeScreen/WelcomeScreen'
import { ChangeHistoryContextProvider } from './contexts/ChangeHistoryContext'
import { CompactModeProvider, useCompactMode, } from './contexts/CompactModeContext'
import { createSpotlightTourState, SpotlightTourContext, } from './contexts/SpotlightTourContext'
import { ThemeContextProvider, useTheme } from './contexts/ThemeContext'
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
import { Root } from './lib/Root'
import { appTour } from './tours/appTour'
import { sidebarTour } from './tours/sidebarTour'
import { timelineTour } from './tours/timelineTour'
import { createAnimationExport } from './utils/animationExport'
import { deepClone } from './utils/clone'
import { createStoreHistory } from './utils/createStoreHistory'
import { decodeSharePayload } from './utils/jsonQueryParam'
import { persistentSignal } from './utils/persistentSignal'
import { buildReadableIds } from './utils/readableIds'
import { saveRecentFlame } from './utils/recentFlames'
import { sum } from './utils/sum'
import { createTimelineState, resolveKeyframeValue } from './utils/timeline'
import { useKeyboardShortcuts } from './utils/useKeyboardShortcuts'
import { useLoadFlameFromFile } from './utils/useLoadFlameFromFile'
import { dismissWelcome, hasWelcomeBeenDismissed, } from './utils/welcomeDismissed'
import type { Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { QualityPreset } from './components/Quality/QualityPresets'
import type { QuickPickerMode } from './components/QuickVariationPicker/QuickVariationPicker'
import type { TourContext, TourGuide, } from './components/SpotlightTour/tourTypes'
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

function getTour(id: string): TourGuide | undefined {
  switch (id) {
    case 'app':
      return appTour
    case 'sidebar':
      return sidebarTour
    case 'timeline':
      return timelineTour
    default:
      return undefined
  }
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

type AppProps = {
  flameFromQuery?: SharePayload
  flameFromWelcome?: () => FlameDescriptor | undefined
  resetFlameFromWelcome?: () => void
}


import { MainWorkspace } from "./MainWorkspace"
import { ToastProvider } from "./contexts/ToastContext"

export function Wrappers() {
  const [flameFromQuery] = createResource(async () => {
    const param = new URLSearchParams(window.location.search)
    const flameDef = param.get('flame')
    if (IS_DEV) {
      console.info(
        '[share:resource] query param present:',
        flameDef !== null,
        'length:',
        flameDef?.length ?? 0,
      )
    }
    if (flameDef !== null) {
      try {
        const result = await decodeSharePayload(flameDef)
        if (IS_DEV) {
          console.info('[share:resource] decode succeeded:', {
            hasFlame: !!result?.flame,
            transformCount: result?.flame
              ? recordKeys(result.flame.transforms ?? {}).length
              : 0,
            hasAnimation: !!result?.animation,
            animTrackCount: result?.animation?.tracks?.length ?? 0,
          })
        }
        return result
      } catch (ex) {
        console.error('[share:resource] decode failed:', ex)
      }
    }
    return undefined
  })

  const [dontShowAgain, setDontShowAgain] = createSignal(false)
  const hasFlameQueryParam = new URLSearchParams(window.location.search).has(
    'flame',
  )
  const [showWelcome, setShowWelcome] = createSignal(
    !hasWelcomeBeenDismissed() && !hasFlameQueryParam,
  )
  const [selectedFlame, setSelectedFlame] = createSignal<
    FlameDescriptor | undefined
  >()

  const spotlightState = createSpotlightTourState(getTour)

  // Support #tour=app|sidebar|timeline hash URLs
  onMount(() => {
    const handleHashChange = () => {
      const hash = window.location.hash
      const match = hash.match(/^#tour=(app|sidebar|timeline)$/)
      if (match) {
        spotlightState.startTour(match[1]!)
        window.location.hash = ''
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    onCleanup(() => {
      window.removeEventListener('hashchange', handleHashChange)
    })

    // Check initial hash on mount
    handleHashChange()
  })

  // Log what gets passed to App
  createEffect(() => {
    const fq = flameFromQuery()
    if (fq !== undefined) {
      if (IS_DEV) {
        console.info('[share:wrappers] passing to App:', {
          hasFlame: !!fq.flame,
          transformCount: fq.flame
            ? recordKeys(fq.flame.transforms ?? {}).length
            : 0,
          hasAnimation: !!fq.animation,
          animTrackCount: fq.animation?.tracks?.length ?? 0,
        })
      }
    }
  })

  function handleStartTour(tourId: string) {
    setShowWelcome(false)
    spotlightState.startTour(tourId)
  }

  const errorHandler = (err: unknown, _: () => void) => {
    if (err instanceof Error) {
      if (err.cause === 'WebGPU') {
        return <WebgpuNotSupported />
      }
    }
    console.error(err)
    return <AppCrashed />
  }

  return (
    <CompactModeProvider>
      <SpotlightTourContext.Provider value={spotlightState}>
        <ThemeContextProvider>
          <KeyframeTargetProvider>
            <Modal>
              <ErrorBoundary fallback={errorHandler}>
                <Root
                  adapterOptions={{
                    powerPreference: 'high-performance',
                  }}
                >
                  <Suspense>
                    <ToastProvider>
                      <MainWorkspace
                        flameFromQuery={flameFromQuery()}
                        flameFromWelcome={selectedFlame}
                        resetFlameFromWelcome={() => {
                          setSelectedFlame(undefined)
                        }}
                      />
                    </ToastProvider>
                    {/* WelcomeScreen overlay on top */}
                    <Show when={showWelcome()}>
                      <WelcomeScreen
                        showDontShowAgain={dontShowAgain()}
                        onDontShowAgainChange={(checked) => {
                          setDontShowAgain(checked)
                          if (checked) {
                            dismissWelcome()
                          }
                        }}
                        onEnter={() => setShowWelcome(false)}
                        onSelectFlame={(flame) => setSelectedFlame(() => flame)}
                        onStartTour={handleStartTour}
                      />
                    </Show>
                  </Suspense>
                </Root>
              </ErrorBoundary>
            </Modal>
          </KeyframeTargetProvider>
        </ThemeContextProvider>
      </SpotlightTourContext.Provider>
    </CompactModeProvider>
  )
}
