import { ErrorBoundary, Show, Suspense } from 'solid-js'
import { vec4f } from 'typegpu/data'
import ui from '@/App.module.css'
import { duelShowing } from '@/arcade/duel'
import { Button } from '@/components/Button/Button'
import { ExportJobHost } from '@/components/ExportJobs/ExportJobHost'
import { ExportJobTracker } from '@/components/ExportJobs/ExportJobTracker'
import { ProgressBar } from '@/components/ProgressBar/ProgressBar'
import { DEFAULT_POINT_COUNT } from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import { animationExportRunning, cameraDuringExportEnabled, exportAccumulationFraction, exportQuality, setCurrentQuality, setQualityPointCountLimit, } from '@/flame/renderStats'
import { getNormalizedVariationName } from '@/flame/variations/utils'
import { Menu } from '@/icons'
import { workspaceIsVisible } from '@/lib/activeTab'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { WheelZoomCamera3D } from '@/lib/WheelZoomCamera3D'
import type { Accessor, JSXElement, Setter, Signal } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { Vec3 } from 'wgpu-matrix'
import type { QualityPreset } from '@/components/Quality/QualityPresets'
import type { Palette } from '@/flame/colorMap'
import type { ExportImageType } from '@/flame/exportImageType'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TransformVariationType } from '@/flame/variations'
import type { CustomVariationDef } from '@/flame/variations/custom/types'
import type { TransformVariationType3D } from '@/flame/variations3D'
import type { ExportDimensions } from '@/utils/exportDimensions'

export const EDGE_FADE_COLOR = {
  light: vec4f(0.96, 0.96, 0.96, 0.7),
  dark: vec4f(0, 0, 0, 0.6),
}

export interface CanvasViewportProps {
  // Mobile / layout
  isMobile: Accessor<boolean>
  showSidebar: Accessor<boolean>
  onCanvasClick: () => void
  onToggleMobileSidebar: () => void
  hideMobileSidebarToggle?: boolean
  /** Px of viewport the editor rail's sheet covers; the canvas pans up by half. */
  railInset?: Accessor<number>

  // Flame / rendering
  flameDescriptor: FlameDescriptor
  effectiveFlame: Accessor<FlameDescriptor>
  canvasPixelRatio: Accessor<number>
  exportDimensions: Accessor<ExportDimensions | undefined>
  qualityPreset: Accessor<QualityPreset>
  qualityPresets: Record<QualityPreset, number>
  adaptiveFilterEnabled: Accessor<boolean>
  stochasticFilterEnabled: Accessor<boolean>
  animationEnabled: Accessor<boolean>
  finalRenderInterval: Accessor<number>
  onExportImage: Accessor<ExportImageType | undefined>
  theme: Accessor<'light' | 'dark'>
  selectedPalette: Accessor<Palette | undefined>
  blendFlame: Accessor<FlameDescriptor | undefined>
  resolvedBlendWeight: Accessor<number>

  // Transport state
  isPlaying: Accessor<boolean>

  // 2D Camera
  effectiveZoom: Accessor<number>
  setFlameZoom: Setter<number>
  effectivePosition: Accessor<v2f>
  setFlamePosition: Setter<v2f>

  // 3D Camera
  effectiveTheta: Accessor<number>
  setFlameTheta: Setter<number>
  effectivePhi: Accessor<number>
  setFlamePhi: Setter<number>
  effectiveRadius: Accessor<number>
  setFlameRadius: Setter<number>
  effectiveTarget3D: Accessor<Vec3>
  setFlameTarget3D: Setter<Vec3>
  effectiveFov: Accessor<number>
  setFlameFov: Setter<number>
  effectiveRoll: Accessor<number>
  setFlameRoll: Setter<number>
  flyMode: Accessor<boolean>
  flySpeed: Signal<number>

  // Hover badges
  hoveredVariationType: Accessor<
    TransformVariationType | TransformVariationType3D | null | undefined
  >
  hoveredCustomVarDef: Accessor<CustomVariationDef | null | undefined>
  hoveredBlendName: Accessor<string | null | undefined>

  // Children (such as BottomBar)
  children?: JSXElement
}

export function CanvasViewport(props: CanvasViewportProps) {
  return (
    // Home and the Arcade cover the editor completely and it stays mounted
    // underneath, so everything in here is behind a full-screen layer: the
    // sidebar tab, the WebGPU poster's "Check WebGPU support" link and the
    // export tracker (z-index 1000, under Home's 2000) were all still in the
    // tab order and still announced. `inert` takes the subtree out of both
    // without unmounting the canvas or stopping a single frame.
    <div
      class={ui.canvasContainer}
      data-tour-target="canvas"
      classList={{ [ui.fullscreen as string]: !props.showSidebar() }}
      style={{ '--rail-inset': `${props.railInset?.() ?? 0}px` }}
      inert={!workspaceIsVisible()}
      onClick={props.onCanvasClick}
    >
      <Show when={props.isMobile() && !props.hideMobileSidebarToggle}>
        <button
          class={ui.sidebarToggle}
          data-replay-region="dim"
          onClick={(e) => {
            e.stopPropagation()
            props.onToggleMobileSidebar()
          }}
          aria-label="Toggle sidebar"
        >
          <Menu />
        </button>
      </Show>
      {/* Text alternative for the WebGPU canvas (WCAG 1.1.1): a name
          via aria-label plus a live, screen-reader-only description of
          the current flame (a pixel-accurate alt is impossible for
          generative art, so describe its structure instead). */}
      <p id="flame-canvas-desc" class="sr-only" aria-live="polite">
        {(() => {
          const name = props.flameDescriptor.metadata?.name?.trim()
          const count = Object.keys(
            props.flameDescriptor.transforms ?? {},
          ).length
          const label =
            name && name.toLowerCase() !== 'unknown' ? name : 'Untitled flame'
          return `${label}: ${count} transform${count === 1 ? '' : 's'}.`
        })()}
      </p>
      <AutoCanvas
        class={ui.canvas}
        data-replay-region="canvas"
        role="img"
        ariaLabel="Fractal flame preview"
        ariaDescribedby="flame-canvas-desc"
        pixelRatio={props.canvasPixelRatio()}
        fixedResolution={props.exportDimensions()}
      >
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
                  Failed to render flame. The flame or animation data might be
                  invalid or incompatible.
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
              when={props.effectiveFlame().renderSettings.dimensions === 3}
              fallback={
                <WheelZoomCamera2D
                  zoom={[props.effectiveZoom, props.setFlameZoom]}
                  position={[props.effectivePosition, props.setFlamePosition]}
                  interactive={() =>
                    !props.isPlaying() &&
                    (!animationExportRunning() || cameraDuringExportEnabled())
                  }
                >
                  <Flam3
                    quality={
                      exportQuality() ??
                      props.qualityPresets[props.qualityPreset()]
                    }
                    pointCountPerBatch={DEFAULT_POINT_COUNT}
                    isExportRenderer
                    accumulationFraction={exportAccumulationFraction()}
                    adaptiveFilterEnabled={props.adaptiveFilterEnabled()}
                    stochasticFilterEnabled={props.stochasticFilterEnabled()}
                    animationEnabled={props.animationEnabled()}
                    flameDescriptor={props.effectiveFlame()}
                    renderInterval={props.finalRenderInterval()}
                    onExportImage={props.onExportImage()}
                    edgeFadeColor={
                      props.showSidebar()
                        ? EDGE_FADE_COLOR[props.theme()]
                        : vec4f(0)
                    }
                    setCurrentQuality={(fn) => setCurrentQuality(() => fn)}
                    setQualityPointCountLimit={(fn) =>
                      setQualityPointCountLimit(() => fn)
                    }
                    palette={props.selectedPalette}
                    blendFlame={props.blendFlame()}
                    blendWeight={props.resolvedBlendWeight()}
                  />
                </WheelZoomCamera2D>
              }
            >
              <WheelZoomCamera3D
                theta={[props.effectiveTheta, props.setFlameTheta]}
                phi={[props.effectivePhi, props.setFlamePhi]}
                radius={[props.effectiveRadius, props.setFlameRadius]}
                target={[props.effectiveTarget3D, props.setFlameTarget3D]}
                fov={[props.effectiveFov, props.setFlameFov]}
                roll={[props.effectiveRoll, props.setFlameRoll]}
                flyMode={props.flyMode}
                flySpeed={props.flySpeed}
                // Not while a duel covers this canvas: this camera
                // listens on `window` for the orbit keys, and the
                // player's seat binds the same setters to its own
                // camera — with both live, every key moved the flame
                // twice.
                interactive={() =>
                  !duelShowing() &&
                  !props.isPlaying() &&
                  (!animationExportRunning() || cameraDuringExportEnabled())
                }
              >
                <Flam3
                  quality={
                    exportQuality() ??
                    props.qualityPresets[props.qualityPreset()]
                  }
                  pointCountPerBatch={DEFAULT_POINT_COUNT}
                  isExportRenderer
                  accumulationFraction={exportAccumulationFraction()}
                  adaptiveFilterEnabled={props.adaptiveFilterEnabled()}
                  animationEnabled={props.animationEnabled()}
                  flameDescriptor={props.effectiveFlame()}
                  renderInterval={props.finalRenderInterval()}
                  onExportImage={props.onExportImage()}
                  edgeFadeColor={
                    props.showSidebar()
                      ? EDGE_FADE_COLOR[props.theme()]
                      : vec4f(0)
                  }
                  setCurrentQuality={(fn) => setCurrentQuality(() => fn)}
                  setQualityPointCountLimit={(fn) =>
                    setQualityPointCountLimit(() => fn)
                  }
                  palette={props.selectedPalette}
                  blendFlame={props.blendFlame()}
                  blendWeight={props.resolvedBlendWeight()}
                />
              </WheelZoomCamera3D>
            </Show>
          </ErrorBoundary>
        </Suspense>
      </AutoCanvas>
      <Show when={props.hoveredVariationType()} keyed>
        {(hv) => (
          <div class={ui.hoverPreviewBadge}>
            Previewing: {getNormalizedVariationName(hv)}
          </div>
        )}
      </Show>
      <Show when={props.hoveredCustomVarDef()} keyed>
        {(cv) => (
          <div class={ui.hoverPreviewBadge}>Previewing custom: {cv.name}</div>
        )}
      </Show>
      <Show when={props.hoveredBlendName()} keyed>
        {(name) => <div class={ui.hoverPreviewBadge}>Blending with {name}</div>}
      </Show>
      <ProgressBar />
      <ExportJobHost />
      <ExportJobTracker />
      {props.children}
    </div>
  )
}
