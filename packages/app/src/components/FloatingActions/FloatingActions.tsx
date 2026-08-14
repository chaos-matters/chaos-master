import { createEffect, createSignal, Show } from 'solid-js'
import { Bookmark, CameraIcon, Discord, Eye, FolderOpen, Home, Pause, Plus, Share, Shuffle, Zap, } from '@/icons'
import { setActiveTab } from '@/lib/activeTab'
import { defaultPills, QualityPresets } from '../Quality/QualityPresets'
import { recorderVisible, setRecorderVisible, } from '../SessionRecorder/recorderUi'
import ui from './FloatingActions.module.css'

type Props = {
  initialLeft: number
  initialTop: number
  onNewFlame: () => void
  onLoadFlame: () => void
  onSaveForLater: () => void
  onRender: () => void
  onQuickExport: () => void
  onShareLink: () => void
  onShareDiscord: () => void
  onLogoFavicon: () => void
  onRandomizeColors: () => void
  hideDiceButtons: () => boolean
  setHideDiceButtons: (v: boolean) => void
  disabled?: boolean
  // Display toggles
  animationEnabled: () => boolean
  setAnimationEnabled: (v: boolean) => void
  showTimeline: () => boolean
  setShowTimeline: (v: boolean) => void
  adaptiveFilterEnabled: () => boolean
  setAdaptiveFilterEnabled: (v: boolean) => void
  stochasticFilterEnabled: () => boolean
  setStochasticFilterEnabled: (v: boolean) => void
  dimensions: () => number
  setDimensions: (v: number) => void
  flyMode: () => boolean
  setFlyMode: (v: boolean) => void
  // Sidebar show/hide (mirrors the 'F' shortcut) — so it's controllable without
  // a keyboard.
  sidebarOpen: () => boolean
  onToggleSidebar: () => void
  isPlaying: () => boolean
  togglePlay: () => void
  // Quality presets
  qualityPreset: () => string
  setQualityPreset: (key: string) => void
  accumulatedPointCount: () => number
  qualityPointCountLimit: () => number
}

export function FloatingActions(props: Props) {
  const isMobileWidget = () => window.innerWidth < 769
  const [left, setLeft] = createSignal(
    isMobileWidget() ? 60 : props.initialLeft,
  )
  const [top, setTop] = createSignal(isMobileWidget() ? 8 : props.initialTop)
  const [dragging, setDragging] = createSignal(false)
  const [userMoved, setUserMoved] = createSignal(false)

  // Keep position in sync with prop changes (e.g. sidebar resize)
  // but only when the user hasn't manually dragged the widget.
  createEffect(() => {
    if (!userMoved()) {
      if (isMobileWidget()) {
        setLeft(60)
        setTop(8)
      } else {
        setLeft(props.initialLeft)
        setTop(props.initialTop)
      }
    }
  })

  let widgetRef: HTMLDivElement | undefined

  function startDrag(e: PointerEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startLeft = left()
    const startTop = top()
    const mobile = isMobileWidget()
    let axisLocked: 'x' | 'y' | 'free' | null = null

    setDragging(true)
    const handle = e.currentTarget as HTMLElement
    handle.setPointerCapture(e.pointerId)

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY

      if (axisLocked === null) {
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          axisLocked = mobile
            ? 'free'
            : Math.abs(dx) >= Math.abs(dy)
              ? 'x'
              : 'y'
        }
        return
      }

      const w = widgetRef?.offsetWidth ?? 0
      const h = widgetRef?.offsetHeight ?? 0

      if (axisLocked === 'free') {
        setLeft(Math.max(0, Math.min(window.innerWidth - w, startLeft + dx)))
        setTop(Math.max(0, Math.min(window.innerHeight - h, startTop + dy)))
        setUserMoved(true)
      } else if (axisLocked === 'x') {
        setLeft(Math.max(0, Math.min(window.innerWidth - w, startLeft + dx)))
        setUserMoved(true)
      } else {
        setTop(Math.max(0, Math.min(window.innerHeight - h, startTop + dy)))
        setUserMoved(true)
      }
    }

    function cleanup() {
      setDragging(false)
      handle.releasePointerCapture(e.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }

    function onUp() {
      cleanup()
    }

    function onCancel() {
      cleanup()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  const [collapsed, setCollapsed] = createSignal(false)
  // Position saved before collapsing so we can restore on expand
  let savedLeft = 60
  let savedTop = 8
  let lastTapTime = 0

  function handleTap() {
    const now = Date.now()
    if (collapsed()) {
      // Single tap on collapsed handle -> expand
      setLeft(savedLeft)
      setTop(savedTop)
      setCollapsed(false)
      return
    }
    // Double-tap detection (< 400ms between taps)
    if (now - lastTapTime < 400) {
      // Collapse: save current position, move to top-right
      savedLeft = left()
      savedTop = top()
      setLeft(window.innerWidth - 28)
      setTop(8)
      setCollapsed(true)
      lastTapTime = 0
    } else {
      lastTapTime = now
    }
  }

  return (
    <div
      ref={widgetRef}
      class={ui.widget}
      classList={{
        [ui.isDragging as string]: dragging(),
        [ui.disabled as string]: props.disabled,
        [ui.collapsed as string]: collapsed(),
      }}
      style={{ left: `${left()}px`, top: `${top()}px` }}
    >
      <div
        class={ui.handle}
        onPointerDown={(e) => {
          if (collapsed()) return // don't start drag when collapsed
          startDrag(e)
        }}
        onClick={handleTap}
        title={
          collapsed()
            ? 'Tap to expand'
            : 'Drag to move / double-tap to collapse'
        }
      >
        <div class={ui.handleIcon}>
          <div class={ui.handleDot} />
          <div class={ui.handleDot} />
          <div class={ui.handleDot} />
        </div>
      </div>
      <Show when={!collapsed()}>
        <div class={ui.rows}>
          {/* Row 1: Action buttons */}
          <div class={ui.buttons}>
            <button
              class={ui.button}
              onClick={() => {
                setActiveTab('home')
              }}
              aria-label="Home"
              title="Home — gallery and what the app can do"
            >
              <Home />
            </button>
            <button
              class={ui.button}
              onClick={props.onNewFlame}
              aria-label="New Flame"
              title="New Flame (fresh starter — undo brings the current one back)"
            >
              <Plus />
            </button>
            <button
              class={ui.button}
              onClick={props.onLoadFlame}
              aria-label="Load Flame"
              title="Load Flame"
              data-tour-target="load-flame"
            >
              <FolderOpen />
            </button>
            <button
              class={ui.button}
              onClick={props.onSaveForLater}
              aria-label="Save for Later"
              title="Save for Later"
              data-tour-target="save-for-later"
            >
              <Bookmark />
            </button>
            <div class={ui.separator} />
            <button
              class={ui.button}
              onClick={props.onRender}
              aria-label="Render image or animation"
              title="Render image or animation"
              data-tour-target="export-png"
            >
              <CameraIcon />
            </button>
            <button
              class={ui.button}
              onClick={props.onQuickExport}
              aria-label="Quick Export"
              title="Quick Export"
              data-tour-target="quick-export"
            >
              <Zap />
            </button>
            <div class={ui.separator} />
            <button
              class={ui.button}
              onClick={props.onShareLink}
              aria-label="Share Link"
              title="Share Link"
              data-tour-target="share-link"
            >
              <Share />
            </button>
            <button
              class={ui.button}
              onClick={props.onShareDiscord}
              aria-label="Share to Discord"
              title="Share to Discord"
              data-tour-target="share-discord"
            >
              <Discord />
            </button>
            <button
              class={ui.button}
              onClick={props.onLogoFavicon}
              disabled={props.dimensions() === 3}
              aria-label={
                props.dimensions() === 3
                  ? 'Logo/Favicon (available only in 2D)'
                  : 'Logo/Favicon'
              }
              title={
                props.dimensions() === 3
                  ? 'Logo/Favicon (available only in 2D)'
                  : 'Logo/Favicon'
              }
              data-tour-target="logo-favicon"
            >
              <Shuffle />
            </button>
            <Show when={!props.hideDiceButtons()}>
              <button
                class={ui.button}
                onClick={props.onRandomizeColors}
                aria-label="Randomize Colors"
                title="Randomize Colors"
                data-tour-target="randomize-colors"
              >
                <svg viewBox="0 0 16 16" width="15" height="15" fill="none">
                  <circle
                    cx="5"
                    cy="6"
                    r="3.5"
                    stroke="currentColor"
                    stroke-width="1.2"
                  />
                  <circle
                    cx="11"
                    cy="6"
                    r="3.5"
                    stroke="currentColor"
                    stroke-width="1.2"
                  />
                  <circle
                    cx="8"
                    cy="12"
                    r="3.5"
                    stroke="currentColor"
                    stroke-width="1.2"
                  />
                </svg>
              </button>
            </Show>
          </div>

          {/* Divider */}
          <div class={ui.divider} />

          {/* Row 2: Display toggles */}
          <div class={ui.toggleRow}>
            {/* Animation Toggle / Play / Pause */}
            <button
              class={ui.toggle}
              classList={{
                [ui.toggleActive as string]: props.animationEnabled(),
              }}
              onClick={() => {
                if (!props.animationEnabled()) {
                  props.setAnimationEnabled(true)
                  if (!props.showTimeline()) {
                    props.setShowTimeline(true)
                  }
                } else if (props.isPlaying()) {
                  props.togglePlay()
                } else {
                  props.setAnimationEnabled(false)
                  if (props.showTimeline()) {
                    props.setShowTimeline(false)
                  }
                }
              }}
              title={
                !props.animationEnabled()
                  ? 'Enable animation mode (opens the timeline)'
                  : props.isPlaying()
                    ? 'Pause playback'
                    : 'Disable animation mode (hides the timeline)'
              }
              data-tour-target="animation-toggle"
            >
              {/* Three distinct states so the icon matches what a click does:
                  off → ▶ enable, playing → ⏸ pause, paused → ⏻ disable. */}
              <Show
                when={props.animationEnabled()}
                fallback={
                  <svg
                    viewBox="0 0 16 16"
                    width="13"
                    height="13"
                    fill="currentColor"
                    stroke="none"
                  >
                    <path d="M5 3l8 5-8 5V3z" />
                  </svg>
                }
              >
                <Show
                  when={props.isPlaying()}
                  fallback={
                    // Enabled + paused: a click disables animation, so show a
                    // power symbol rather than a misleading play triangle.
                    <svg
                      viewBox="0 0 16 16"
                      width="13"
                      height="13"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.6"
                      stroke-linecap="round"
                    >
                      <path d="M8 2.4V7.2" />
                      <path d="M5.1 4.6a4.2 4.2 0 1 0 5.8 0" />
                    </svg>
                  }
                >
                  <Pause />
                </Show>
              </Show>
            </button>

            {/* Show Timeline */}
            <button
              class={ui.toggle}
              classList={{ [ui.toggleActive as string]: props.showTimeline() }}
              onClick={() => {
                const checked = !props.showTimeline()
                if ('startViewTransition' in document) {
                  document.startViewTransition(() => {
                    props.setShowTimeline(checked)
                    if (!checked) props.setAnimationEnabled(false)
                  })
                } else {
                  props.setShowTimeline(checked)
                  if (!checked) props.setAnimationEnabled(false)
                }
              }}
              title={
                props.showTimeline()
                  ? 'Hide timeline (also disables animation)'
                  : 'Show timeline'
              }
              data-tour-target="show-timeline"
            >
              {/* Timeline / rows icon */}
              <svg
                viewBox="0 0 16 16"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
              >
                <line x1="2" y1="4" x2="14" y2="4" />
                <line x1="2" y1="8" x2="10" y2="8" />
                <line x1="2" y1="12" x2="12" y2="12" />
              </svg>
            </button>

            {/* Show / Hide Sidebar (mirrors the 'F' shortcut) — grouped with the
                other show/hide toggles. */}
            <button
              class={ui.toggle}
              classList={{ [ui.toggleActive as string]: props.sidebarOpen() }}
              onClick={props.onToggleSidebar}
              title={
                props.sidebarOpen() ? 'Hide sidebar (F)' : 'Show sidebar (F)'
              }
            >
              {/* Sidebar panel icon — a panel with a left rail. */}
              <svg
                viewBox="0 0 16 16"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
                <line x1="6.2" y1="2.5" x2="6.2" y2="13.5" />
              </svg>
            </button>

            {/* Step recorder dock. Grouped with the other show/hide toggles;
                the dock's own × sets the same signal, so the two agree. */}
            <button
              class={ui.toggle}
              classList={{
                [ui.toggleActive as string]: recorderVisible(),
              }}
              onClick={() => {
                setRecorderVisible(!recorderVisible())
              }}
              title={
                recorderVisible()
                  ? 'Hide the step recorder'
                  : 'Show the step recorder'
              }
            >
              {/* A record dot next to a step list — what the dock does. */}
              <svg
                viewBox="0 0 16 16"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linecap="round"
              >
                <circle
                  cx="4.5"
                  cy="8"
                  r="2.6"
                  fill="currentColor"
                  stroke="none"
                />
                <line x1="9.5" y1="5.5" x2="14" y2="5.5" />
                <line x1="9.5" y1="8" x2="14" y2="8" />
                <line x1="9.5" y1="10.5" x2="12" y2="10.5" />
              </svg>
            </button>

            <div class={ui.toggleSeparator} />

            {/* Mitchell-Netravali Stochastic Filter (2D + 3D) */}
            <button
              class={ui.toggle}
              classList={{
                [ui.toggleActive as string]: props.stochasticFilterEnabled(),
              }}
              onClick={() => {
                props.setStochasticFilterEnabled(
                  !props.stochasticFilterEnabled(),
                )
              }}
              title="Mitchell-Netravali stochastic resampling filter (sharper edges)"
            >
              {/* MN reconstruction kernel: a central lobe with the two small
                  negative side-lobes that give the filter its sharpness. */}
              <svg
                viewBox="0 0 16 16"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M1.5 10 C 3.5 10 4.2 11.5 5.3 11.5 C 6.3 11.5 6.7 3.3 8 3.3 C 9.3 3.3 9.7 11.5 10.7 11.5 C 11.8 11.5 12.5 10 14.5 10" />
              </svg>
            </button>

            {/* Adaptive Filter (density-estimation blur) */}
            <button
              class={ui.toggle}
              classList={{
                [ui.toggleActive as string]: props.adaptiveFilterEnabled(),
              }}
              onClick={() => {
                props.setAdaptiveFilterEnabled(!props.adaptiveFilterEnabled())
              }}
              title="Adaptive density-estimation blur (smooths sparse regions)"
              data-tour-target="adaptive-filter"
            >
              <Eye />
            </button>

            <div class={ui.toggleSeparator} />

            {/* 2D/3D Toggle */}
            <button
              class={ui.toggle}
              classList={{
                [ui.toggleActive as string]: props.dimensions() === 3,
              }}
              onClick={() => {
                props.setDimensions(props.dimensions() === 3 ? 2 : 3)
              }}
              title={props.dimensions() === 3 ? 'Switch to 2D' : 'Switch to 3D'}
            >
              <svg
                viewBox="0 0 16 16"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M8 1l-6.5 3.5v7L8 15l6.5-3.5v-7L8 1z" />
                <path d="M8 1v14" />
                <path d="M1.5 4.5l6.5 3.5 6.5-3.5" />
                <path d="M1.5 11.5l3.5-2" />
                <path d="M11 9.5l3.5 2" />
              </svg>
            </button>

            {/* Fly Mode (3D only) */}
            <Show when={props.dimensions() === 3}>
              <button
                class={ui.toggle}
                classList={{
                  [ui.toggleActive as string]: props.flyMode(),
                }}
                onClick={() => {
                  props.setFlyMode(!props.flyMode())
                }}
                title={
                  props.flyMode()
                    ? 'Exit fly mode'
                    : 'Fly mode — click to look around (Esc to release), WASD/arrows to move, Q/E up/down, scroll for speed'
                }
              >
                {/* Paper-plane icon */}
                <svg
                  viewBox="0 0 16 16"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M15 1.5L7.5 9" />
                  <path d="M15 1.5l-4.7 13-2.8-5.5L2 6.2 15 1.5z" />
                </svg>
              </button>
            </Show>

            <div class={ui.toggleSeparator} />

            {/* Hide Randomizers */}
            <button
              class={ui.toggle}
              classList={{
                [ui.toggleActive as string]: !props.hideDiceButtons(),
              }}
              onClick={() => {
                props.setHideDiceButtons(!props.hideDiceButtons())
              }}
              title={
                props.hideDiceButtons()
                  ? 'Show Randomizers'
                  : 'Hide Randomizers'
              }
            >
              {/* Dice icon */}
              <svg
                viewBox="0 0 16 16"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="2" y="2" width="12" height="12" rx="2" />
                <circle
                  cx="5.5"
                  cy="5.5"
                  r="0.8"
                  fill="currentColor"
                  stroke="none"
                />
                <circle
                  cx="10.5"
                  cy="5.5"
                  r="0.8"
                  fill="currentColor"
                  stroke="none"
                />
                <circle
                  cx="8"
                  cy="8"
                  r="0.8"
                  fill="currentColor"
                  stroke="none"
                />
                <circle
                  cx="5.5"
                  cy="10.5"
                  r="0.8"
                  fill="currentColor"
                  stroke="none"
                />
                <circle
                  cx="10.5"
                  cy="10.5"
                  r="0.8"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
            </button>
          </div>

          {/* Divider */}
          <div class={ui.divider} />

          {/* Row 3: Quality Presets */}
          <div class={ui.qualityRow} data-tour-target="quality-presets">
            <QualityPresets
              pills={defaultPills}
              selectedKey={props.qualityPreset()}
              onSelect={props.setQualityPreset}
              allPillsFill={true}
              currentPoints={props.accumulatedPointCount()}
              targetPoints={props.qualityPointCountLimit()}
              compact={true}
              inlinePoints={true}
            />
          </div>
        </div>
      </Show>
    </div>
  )
}
