import { createEffect, createSignal, Show } from 'solid-js'
import { Bookmark, CameraIcon, FolderOpen, Share, Shuffle, Zap } from '@/icons'
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
      classList={{ [ui.isDragging as string]: dragging() }}
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
      <div class={ui.buttons}>
        <button
          class={ui.button}
          onClick={props.onLoadFlame}
          title="Load Flame"
        >
          <FolderOpen />
        </button>
        <button
          class={ui.button}
          onClick={props.onSaveForLater}
          title="Save for Later"
        >
          <Bookmark />
        </button>
        <div class={ui.separator} />
        <button
          class={ui.button}
          onClick={props.onRender}
          title="Render image or animation"
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
    </div>
  )
}
