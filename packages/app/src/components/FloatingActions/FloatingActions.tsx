import { createEffect, createSignal, Show } from 'solid-js'
import { Bookmark, CameraIcon, Eye, FolderOpen, Pause, PlayPause, Share, Shuffle, Zap } from '@/icons'
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
  isPlaying: () => boolean
  togglePlay: () => void
  // Quality presets
  qualityPreset: () => string
  setQualityPreset: (key: string) => void
  accumulatedPointCount: () => number
  qualityPointCountLimit: () => number
}

export function FloatingActions(props: Props) {
  const [left, setLeft] = createSignal(props.initialLeft)
  const [top, setTop] = createSignal(props.initialTop)
  const [dragging, setDragging] = createSignal(false)
  const [userMoved, setUserMoved] = createSignal(false)

  // Keep position in sync with prop changes (e.g. sidebar resize)
  // but only when the user hasn't manually dragged the widget.
  createEffect(() => {
    if (!userMoved()) {
      setLeft(props.initialLeft)
      setTop(props.initialTop)
    }
  })

  let widgetRef: HTMLDivElement | undefined

  function startDrag(e: PointerEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startLeft = left()
    const startTop = top()
    let axisLocked: 'x' | 'y' | null = null

    setDragging(true)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY

      if (axisLocked === null) {
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          axisLocked = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
        }
        return
      }

      if (axisLocked === 'x') {
        const w = widgetRef?.offsetWidth ?? 0
        const newLeft = Math.max(
          0,
          Math.min(window.innerWidth - w, startLeft + dx),
        )
        setLeft(newLeft)
        setUserMoved(true)
      } else {
        const h = widgetRef?.offsetHeight ?? 0
        const newTop = Math.max(
          0,
          Math.min(window.innerHeight - h, startTop + dy),
        )
        setTop(newTop)
        setUserMoved(true)
      }
    }

    function onUp() {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      ref={widgetRef}
      class={ui.widget}
      classList={{
        [ui.isDragging as string]: dragging(),
        [ui.disabled as string]: props.disabled,
      }}
      style={{ left: `${left()}px`, top: `${top()}px` }}
    >
      <div
        class={ui.handle}
        onPointerDown={startDrag}
        title="Drag to move (axis-locked)"
      >
        <div class={ui.handleIcon}>
          <div class={ui.handleDot} />
          <div class={ui.handleDot} />
          <div class={ui.handleDot} />
        </div>
      </div>
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
            onClick={props.onLogoFavicon}
            title="Logo/Favicon"
          >
            <Shuffle />
          </button>
          <Show when={!props.hideDiceButtons()}>
            <button
              class={ui.button}
              onClick={props.onRandomizeColors}
              title="Randomize Colors"
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
          {/* Enable Animation */}
          <button
            class={ui.toggle}
            classList={{ [ui.toggleActive as string]: props.animationEnabled() }}
            onClick={() => { props.setAnimationEnabled(!props.animationEnabled()) }}
            title="Enable Animation"
          >
            <PlayPause />
          </button>

          {/* Show Timeline */}
          <button
            class={ui.toggle}
            classList={{ [ui.toggleActive as string]: props.showTimeline() }}
            onClick={() => {
              const checked = !props.showTimeline()
              if ('startViewTransition' in document) {
                document.startViewTransition(() => { props.setShowTimeline(checked) })
              } else {
                props.setShowTimeline(checked)
              }
            }}
            title="Show Timeline"
          >
            {/* Timeline / rows icon */}
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
              <line x1="2" y1="4" x2="14" y2="4" />
              <line x1="2" y1="8" x2="10" y2="8" />
              <line x1="2" y1="12" x2="12" y2="12" />
            </svg>
          </button>

          {/* Adaptive Filter */}
          <button
            class={ui.toggle}
            classList={{ [ui.toggleActive as string]: props.adaptiveFilterEnabled() }}
            onClick={() => { props.setAdaptiveFilterEnabled(!props.adaptiveFilterEnabled()) }}
            title="Adaptive Filter"
          >
            <Eye />
          </button>

          <div class={ui.toggleSeparator} />

          {/* Hide Randomizers */}
          <button
            class={ui.toggle}
            classList={{ [ui.toggleActive as string]: !props.hideDiceButtons() }}
            onClick={() => { props.setHideDiceButtons(!props.hideDiceButtons()) }}
            title={props.hideDiceButtons() ? 'Show Randomizers' : 'Hide Randomizers'}
          >
            {/* Dice icon */}
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="2" width="12" height="12" rx="2" />
              <circle cx="5.5" cy="5.5" r="0.8" fill="currentColor" stroke="none" />
              <circle cx="10.5" cy="5.5" r="0.8" fill="currentColor" stroke="none" />
              <circle cx="8" cy="8" r="0.8" fill="currentColor" stroke="none" />
              <circle cx="5.5" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
              <circle cx="10.5" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
            </svg>
          </button>

          <div class={ui.toggleSeparator} />

          {/* Play / Pause (only when animation is enabled) */}
          <Show when={props.animationEnabled()}>
            <button
              class={ui.toggle}
              classList={{ [ui.toggleActive as string]: props.isPlaying() }}
              onClick={props.togglePlay}
              title={props.isPlaying() ? 'Pause' : 'Play'}
            >
              <Show when={props.isPlaying()} fallback={
                <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" stroke="none">
                  <path d="M5 3l8 5-8 5V3z" />
                </svg>
              }>
                <Pause />
              </Show>
            </button>
          </Show>
        </div>

        {/* Divider */}
        <div class={ui.divider} />

        {/* Row 3: Quality Presets */}
        <div class={ui.qualityRow}>
          <QualityPresets
            pills={defaultPills}
            selectedKey={props.qualityPreset()}
            onSelect={props.setQualityPreset}
            allPillsFill={true}
            currentPoints={props.accumulatedPointCount()}
            targetPoints={props.qualityPointCountLimit()}
            compact={true}
          />
        </div>
      </div>
    </div>
  )
}
