import { createMemo, createSignal, ErrorBoundary, Show, Suspense, } from 'solid-js'
import { vec4f } from 'typegpu/data'
import ui from '@/App.module.css'
import { duelShowing } from '@/arcade/duel'
import { Button } from '@/components/Button/Button'
import { ExportJobHost } from '@/components/ExportJobs/ExportJobHost'
import { ExportJobTracker } from '@/components/ExportJobs/ExportJobTracker'
import { usePrefersReducedMotion } from '@/components/Home/homePlayback'
import { ProgressBar } from '@/components/ProgressBar/ProgressBar'
import { SHEET_EASING, SHEET_TRANSITION_MS, } from '@/components/TouchSurface/detents'
import { DEFAULT_POINT_COUNT } from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import { animationExportRunning, cameraDuringExportEnabled, exportAccumulationFraction, exportQuality, setCurrentQuality, setQualityPointCountLimit, } from '@/flame/renderStats'
import { getNormalizedVariationName } from '@/flame/variations/utils'
import { Menu } from '@/icons'
import { workspaceIsVisible } from '@/lib/activeTab'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { leadingCover } from '@/lib/canvasFraming'
import { createEasedValue, cubicBezier } from '@/lib/easing'
import { glassAllowed } from '@/lib/glass'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { WheelZoomCamera3D } from '@/lib/WheelZoomCamera3D'
import { useElementSize } from '@/utils/useElementSize'
import { useViewFraming } from './useViewFraming'
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
import type { BlendIntent } from '@/hooks/useWorkspaceBlendPick'
import type { Covered } from '@/lib/canvasFraming'
import type { ExportDimensions } from '@/utils/exportDimensions'

/** The badge over a hovered partner tile, by what the gallery is picking
 *  for. Evolve and Diff preview nothing, so theirs says what a click does. */
const HOVER_BADGE: Record<BlendIntent, string> = {
  blend: 'Blending with',
  morph: 'Morphing into',
  breed: 'Breeding with',
  evolve: 'Evolve with',
  diff: 'Compare with',
}

export const EDGE_FADE_COLOR = {
  light: vec4f(0.96, 0.96, 0.96, 0.7),
  dark: vec4f(0, 0, 0, 0.6),
}

/**
 * No fade, as one value: the memo over edgeFadeColor compares by identity,
 * and the covered shares change every frame while the rail's sheet eases,
 * so a fresh zero each time would rewrite the renderer's uniform for the
 * same colour (ClashStage keeps one the same way).
 */
export const NO_EDGE_FADE = vec4f(0)

/**
 * What the renderer fades the canvas's rim to: the theme's colour beside the
 * sidebar, and none in full screen or while glass floating over the canvas
 * covers part of it: the tablet deck, the glass desktop sidebar or the rail's
 * glass sheet (`covered`, useViewFraming.ts). There the rim runs on under the
 * glass, and the fade laid a band down it, dark or light with the theme, that
 * the page beside the canvas never had; the canvas is then framed as it is in
 * full screen.
 */
export function edgeFadeColor(
  theme: 'light' | 'dark',
  showSidebar: boolean,
  covered: Covered,
) {
  return showSidebar &&
    covered.left === 0 &&
    covered.right === 0 &&
    covered.bottom === 0
    ? EDGE_FADE_COLOR[theme]
    : NO_EDGE_FADE
}

/** A covered share for the box's style: unset rather than 0, like the
 *  attribute on the canvas itself. */
const coveredStyle = (share: number) => (share > 0 ? String(share) : undefined)

export interface CanvasViewportProps {
  // Mobile / layout
  isMobile: Accessor<boolean>
  showSidebar: Accessor<boolean>
  onCanvasClick: () => void
  onToggleMobileSidebar: () => void
  hideMobileSidebarToggle?: boolean
  /**
   * Px of viewport the editor rail's sheet covers above peek. The canvas
   * slides up by half, or, while the sheet is glass, the camera frames the
   * flame above it.
   */
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
  /** Radians, resolved through the timeline like zoom and position are. */
  effectiveRotation: Accessor<number>

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
  /** What the partner gallery is picking for, which the badge above says. */
  blendIntent: Accessor<BlendIntent>

  // Children (such as BottomBar)
  children?: JSXElement
}

export function CanvasViewport(props: CanvasViewportProps) {
  // With the Glass panels setting on, the tablet deck, the desktop sidebar
  // and the rail's sheet float over this canvas and the cameras frame the
  // flame in the part they leave visible. The shift is the view's alone: the
  // document's camera stays what it is with the setting off, and every image
  // taken off the canvas is cut to the part on show (useViewFraming.ts).
  const [container, setContainer] = createSignal<HTMLDivElement>()
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>()
  const containerSize = useElementSize(container)
  // The rail's sheet covers the canvas's foot past peek, and the flame is
  // kept in view above it one of two ways. While the Glass panels setting
  // applies, the sheet is glass (TouchSurface/EditorRail.tsx) and the canvas
  // runs on under it, framed by the camera, the cover easing along the
  // sheet's own transition as the slide does. Otherwise the opaque sheet
  // hides the canvas's foot and the canvas slides up by half the cover
  // (App.module.css, .canvas), as it did before there was glass. A switch
  // between the two while the sheet is open runs both moves at once, and
  // they cancel out.
  const railInset = () => props.railInset?.() ?? 0
  const sheetCover = createEasedValue(
    () => (glassAllowed() ? railInset() : 0),
    {
      durationMs: SHEET_TRANSITION_MS,
      easing: cubicBezier(SHEET_EASING),
      instant: usePrefersReducedMotion(),
    },
  )
  const railSlide = () => (glassAllowed() ? 0 : railInset())
  const framing = useViewFraming({
    width: () => containerSize()?.width,
    height: () => containerSize()?.height,
    bottom: sheetCover,
    canvas,
    exportDimensions: () => props.exportDimensions(),
    onExportImage: () => props.onExportImage(),
  })
  const edgeFade = createMemo(() =>
    edgeFadeColor(props.theme(), props.showSidebar(), framing.covered()),
  )
  // While the glass sidebar floats over the canvas, the box spans the
  // sidebar's column as well (App.module.css, .underSidebar), and the bottom
  // bar starts where the sidebar's cover ends, where it is with the setting
  // off. Read from the sidebar's measure rather than from the framing, which
  // drops the cover while an export sizes the canvas: the layout does not
  // move for an export.
  const underSidebar = () => leadingCover() > 0
  // An export sizing the canvas itself renders a frame with the aspect of
  // the part on show, not of the box spanning the sidebar's column: the box
  // says so, and App.module.css draws the canvas in that part meanwhile.
  const exportingUnderSidebar = () =>
    underSidebar() && props.exportDimensions() !== undefined

  return (
    // Home and the Arcade cover the editor completely and it stays mounted
    // underneath, so everything in here is behind a full-screen layer: the
    // sidebar tab, the WebGPU poster's "Check WebGPU support" link and the
    // export tracker (z-index 1000, under Home's 2000) were all still in the
    // tab order and still announced. `inert` takes the subtree out of both
    // without unmounting the canvas or stopping a single frame.
    <div
      ref={setContainer}
      class={ui.canvasContainer}
      data-tour-target="canvas"
      classList={{
        [ui.fullscreen as string]: !props.showSidebar(),
        [ui.underSidebar as string]: underSidebar(),
        [ui.exporting as string]: exportingUnderSidebar(),
      }}
      // The hover badge centres on the part on show (App.module.css).
      style={{
        '--rail-inset': `${railSlide()}px`,
        '--covered-left': coveredStyle(framing.covered().left),
        '--covered-right': coveredStyle(framing.covered().right),
        '--leading-cover': underSidebar() ? `${leadingCover()}px` : undefined,
      }}
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
        ref={setCanvas}
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
                  rotation={props.effectiveRotation}
                  viewShift={framing.viewShift}
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
                    onExportImage={framing.exportImage()}
                    edgeFadeColor={edgeFade()}
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
                viewShift={framing.viewShift}
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
                  onExportImage={framing.exportImage()}
                  edgeFadeColor={edgeFade()}
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
        {(name) => (
          <div class={ui.hoverPreviewBadge}>
            {HOVER_BADGE[props.blendIntent()]} {name}
          </div>
        )}
      </Show>
      <ProgressBar />
      <ExportJobHost />
      <ExportJobTracker />
      {props.children}
    </div>
  )
}
