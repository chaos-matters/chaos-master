import { createEffect, createSignal, Show } from 'solid-js'
import { Bookmark, CameraIcon, Discord, Eye, FolderOpen, Pause, Share, Shuffle, Zap, } from '@/icons'
import { defaultPills, QualityPresets } from '../Quality/QualityPresets'
import ui from './FloatingActions.module.css'

type Props = {
  initialLeft: number
  initialTop: number
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
  dimensions: () => number
  setDimensions: (v: number) => void
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
              onClick={props.onLoadFlame}
              title="Load Flame"
              data-tour-target="load-flame"
            >
              <FolderOpen />
            </button>
            <button
              class={ui.button}
              onClick={props.onSaveForLater}
              title="Save for Later"
              data-tour-target="save-for-later"
            >
              <Bookmark />
            </button>
            <div class={ui.separator} />
            <button
              class={ui.button}
              onClick={props.onRender}
              title="Render image or animation"
              data-tour-target="export-png"
            >
              <CameraIcon />
            </button>
            <button
              class={ui.button}
              onClick={props.onQuickExport}
              title="Quick Export"
              data-tour-target="quick-export"
            >
              <Zap />
            </button>
            <div class={ui.separator} />
            <button
              class={ui.button}
              onClick={props.onShareLink}
              title="Share Link"
              data-tour-target="share-link"
            >
              <Share />
            </button>
            <button
              class={ui.button}
              onClick={props.onShareDiscord}
              title="Share to Discord"
              data-tour-target="share-discord"
            >
              <Discord />
            </button>
            <button
              class={ui.button}
              onClick={props.onLogoFavicon}
              title="Logo/Favicon"
              data-tour-target="logo-favicon"
            >
              <Shuffle />
            </button>
            <Show when={!props.hideDiceButtons()}>
              <button
                class={ui.button}
                onClick={props.onRandomizeColors}
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
                  ? 'Enable Animation Mode'
                  : props.isPlaying()
                    ? 'Pause'
                    : 'Disable Animation Mode'
              }
              data-tour-target="animation-toggle"
            >
              <Show
                when={props.animationEnabled() && props.isPlaying()}
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
                <Pause />
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
              title="Show Timeline"
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

            {/* Adaptive Filter */}
            <button
              class={ui.toggle}
              classList={{
                [ui.toggleActive as string]: props.adaptiveFilterEnabled(),
              }}
              onClick={() => {
                props.setAdaptiveFilterEnabled(!props.adaptiveFilterEnabled())
              }}
              title="Adaptive Filter"
              data-tour-target="adaptive-filter"
            >
              <Eye />
            </button>

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
