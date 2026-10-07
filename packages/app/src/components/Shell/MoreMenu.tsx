import { createEffect, For, onCleanup, Show } from 'solid-js'
import { pilotOwnsKeyboard } from '@/arcade/pilot'
import { createBackLayer } from '@/lib/backStack'
import ui from './MoreMenu.module.css'
import type { MoreMenuItem } from './moreMenuItems'

export interface MoreMenuProps {
  items: readonly MoreMenuItem[]
  open: boolean
  onClose: () => void
  /**
   * Where the list sits. The two hosts anchor differently - under the top
   * bar's pill, and above the shell's dock - so placement stays with the host
   * while the list's own look lives in MoreMenu.module.css.
   */
  menuClass: string
  /**
   * The button that opens the list. Escape and back hand focus back to it,
   * so a keyboard user is not dropped on <body>. Without one, the element
   * that had focus when the list opened gets it back, which is the trigger
   * wherever a click focuses a button.
   */
  trigger?: () => HTMLElement | undefined
}

/**
 * The one More popover. Both surfaces offer the same list (moreMenuItems.ts) and
 * rendered it twice: two sets of markup, two back registrations, and two
 * stylesheets that had already drifted apart on width, elevation and icon.
 *
 * The backdrop stays with each host on purpose. The top bar's pill carries a
 * backdrop-filter, which makes it the containing block for a fixed child, so
 * the top bar renders its backdrop outside the header; the shell's lives
 * inside the dock. One shared element would have to be right in both places
 * at once.
 *
 * The top bar holds the list in a frame beside its glass pill, not inside
 * it: the list is glass too, and glass inside a blurred element can only
 * sample that element's fill (glass-panels.md, phase 1).
 */
export function MoreMenu(props: MoreMenuProps) {
  let opener: HTMLElement | undefined
  createEffect(() => {
    if (!props.open || typeof document === 'undefined') return
    const active = document.activeElement
    opener =
      active instanceof HTMLElement && active !== document.body
        ? active
        : undefined
  })

  /** Closes the list from Escape or back, and puts focus where it was. An
   *  item's own close does not: what it opens takes the focus. */
  function dismiss() {
    const back = props.trigger?.() ?? opener
    props.onClose()
    back?.focus()
  }

  createBackLayer(() => props.open, dismiss, 'more menu')

  // Escape closes it too, as it closes the desktop dialogs and the Advanced
  // tools drawer: a tablet with a keyboard, or a desktop window in the touch
  // layout, has no back gesture. Taken in capture on the window, ahead of
  // Home's own Escape boundary (Home/homeEscape.ts) and the editor's
  // shortcuts, so one press closes the nearest layer and nothing under it.
  createEffect(() => {
    if (!props.open) return
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || ev.defaultPrevented) return
      // Under the Arcade's screen lock Escape is the pilot's (arcade/pilot.ts).
      if (pilotOwnsKeyboard()) return
      ev.preventDefault()
      ev.stopImmediatePropagation()
      dismiss()
    }
    window.addEventListener('keydown', onKeyDown, true)
    onCleanup(() => {
      window.removeEventListener('keydown', onKeyDown, true)
    })
  })

  return (
    <Show when={props.open}>
      <div
        class={`${ui.menu} ${props.menuClass}`}
        role="menu"
        aria-label="More"
      >
        <For each={props.items}>
          {(item) => (
            <button
              type="button"
              role="menuitem"
              class={ui.item}
              onClick={() => {
                props.onClose()
                item.run()
              }}
            >
              <item.Icon class={ui.icon} />
              <span>{item.label}</span>
            </button>
          )}
        </For>
      </div>
    </Show>
  )
}
