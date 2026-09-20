import { For, Show } from 'solid-js'
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
}

/**
 * The one More popover. Both surfaces offer the same list (moreMenuItems.ts) and
 * rendered it twice: two sets of markup, two back registrations, and two
 * stylesheets that had already drifted apart on width, elevation and icon.
 *
 * The backdrop stays with each host on purpose. The top bar's pill carries a
 * backdrop-filter and a centring transform, which make it the containing
 * block for a fixed child, so its backdrop has to be rendered outside the
 * header; the shell's lives inside the dock. One shared element would have to
 * be right in both places at once.
 */
export function MoreMenu(props: MoreMenuProps) {
  createBackLayer(
    () => props.open,
    () => {
      props.onClose()
    },
    'more menu',
  )

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
