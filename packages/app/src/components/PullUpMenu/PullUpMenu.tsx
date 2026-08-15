import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { Button } from '../Button/Button'
import ui from './PullUpMenu.module.css'

export interface PullUpMenuItem {
  label: string
  title?: string
  onClick: () => void
}

/**
 * Toolbar button that opens a compact menu ABOVE itself (a pull-up), used to
 * group the view-controls feature launchers without eating toolbar width.
 *
 * The panel is rendered through a Portal with fixed positioning so it can
 * escape the toolbar's horizontal scroll container (an absolutely-positioned
 * child would be clipped by `overflow-x: auto`). It closes on outside press,
 * Escape, item selection, resize, or scroll.
 */
export function PullUpMenu(props: {
  label: string
  title?: string
  items: PullUpMenuItem[]
  /** Stable replay/tour anchor on the trigger (the portaled menu is transient). */
  'data-tour-target'?: string
}) {
  const [open, setOpen] = createSignal(false)
  const [anchor, setAnchor] = createSignal({ left: 0, bottom: 0, width: 0 })
  let wrapEl: HTMLSpanElement | undefined
  let panelEl: HTMLDivElement | undefined

  function toggle() {
    if (!open() && wrapEl) {
      const rect = wrapEl.getBoundingClientRect()
      // Clamp so the panel never overflows the right viewport edge (the
      // toolbar can be scrolled with the trigger near the edge).
      const PANEL_MAX = 240
      const left = Math.min(rect.left, window.innerWidth - PANEL_MAX - 8)
      setAnchor({
        left: Math.max(8, left),
        bottom: window.innerHeight - rect.top + 6,
        width: rect.width,
      })
    }
    setOpen((v) => !v)
  }

  createEffect(() => {
    if (!open()) return
    const onPress = (e: PointerEvent) => {
      const t = e.target as Node
      if (wrapEl?.contains(t) || panelEl?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onLayoutShift = () => setOpen(false)
    document.addEventListener('pointerdown', onPress)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onLayoutShift)
    // Capture-phase so scrolls inside nested containers (the toolbar itself)
    // also close the panel — its anchor point is stale the moment they move.
    window.addEventListener('scroll', onLayoutShift, true)
    onCleanup(() => {
      document.removeEventListener('pointerdown', onPress)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onLayoutShift)
      window.removeEventListener('scroll', onLayoutShift, true)
    })
  })

  return (
    <span class={ui.wrap} ref={wrapEl}>
      <Button
        title={props.title}
        active={open()}
        aria-haspopup="menu"
        aria-expanded={open()}
        onClick={toggle}
        data-tour-target={props['data-tour-target']}
      >
        {props.label}
        <span class={ui.caret} classList={{ [ui.caretOpen!]: open() }} />
      </Button>
      <Show when={open()}>
        <Portal>
          <div
            class={ui.panel}
            ref={panelEl}
            role="menu"
            style={{
              left: `${anchor().left}px`,
              bottom: `${anchor().bottom}px`,
              'min-width': `${Math.max(anchor().width, 168)}px`,
            }}
          >
            <For each={props.items}>
              {(item) => (
                <button
                  type="button"
                  role="menuitem"
                  class={ui.item}
                  title={item.title}
                  onClick={() => {
                    setOpen(false)
                    item.onClick()
                  }}
                >
                  {item.label}
                </button>
              )}
            </For>
          </div>
        </Portal>
      </Show>
    </span>
  )
}
