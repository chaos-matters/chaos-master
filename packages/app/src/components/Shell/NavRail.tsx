import { createSignal, For, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { LumenMark, MoreDots, Settings } from '@/icons'
import { DESTINATIONS, tickForDestination } from './destinations'
import { MoreMenu } from './MoreMenu'
import { buildMoreMenu } from './moreMenuItems'
import ui from './NavRail.module.css'
import type { Accessor } from 'solid-js'
import type { ShellDestination } from './destinations'
import type { MoreMenuHandlers } from './moreMenuItems'

export interface NavRailProps {
  current: Accessor<ShellDestination>
  onSelect: (destination: ShellDestination) => void
  onOpenSettings: () => void
  /** The same list every other surface offers (moreMenuItems.ts). */
  more?: MoreMenuHandlers
}

/**
 * The tablet's shell: permanent on the leading edge wherever the inspector
 * deck fits (the 900px rule in stores/workspaceLayoutStore.ts), not at every
 * tablet width - a portrait iPad or a Split View pane below it gets the
 * phone's rail with the capsule docked in it instead.
 *
 * Where it does mount it is genuinely permanent: Library is inset by this
 * column (Home/HomeTab.module.css `.deck`) rather than covering it, so the
 * rail stays visible and tappable on every destination. It never minimises
 * the way the capsule does - a tablet has the width to spare - and it
 * carries Settings at the bottom, which is not a destination but the one
 * thing with nowhere else to live on a touch layout.
 *
 * More is beside it, and matters most here: the phone's bar is not mounted on
 * this layout and the editor's top bar is behind Home, so without it Library
 * on a landscape tablet reached neither the Arcade nor Share link, Export
 * options, Advanced tools, Documentation nor the benchmark until you went
 * back to Create.
 */
export function NavRail(props: NavRailProps) {
  const [moreOpen, setMoreOpen] = createSignal(false)
  const moreItems = () => buildMoreMenu(props.more ?? {})

  function select(destination: ShellDestination) {
    tickForDestination(destination, props.current())
    props.onSelect(destination)
  }

  return (
    <>
      <nav class={ui.rail} aria-label="Destinations">
        {/* The mark carries its own two inks and is never tinted. */}
        <LumenMark class={ui.mark} />
        <For each={DESTINATIONS}>
          {(destination) => (
            <button
              type="button"
              class={ui.item}
              aria-current={
                props.current() === destination.id ? 'page' : undefined
              }
              onClick={() => {
                select(destination.id)
              }}
            >
              <destination.Icon class={ui.icon} />
              {destination.label}
            </button>
          )}
        </For>
        <div class={ui.spacer} />
        {/* Always offered, because the list is never empty: the Arcade
            defaults into it (Shell/moreMenuItems.ts). The guard that stood here
            read as if a host could open an empty menu, and could not fire. */}
        <button
          type="button"
          class={ui.item}
          aria-expanded={moreOpen()}
          onClick={() => {
            setMoreOpen((was) => !was)
          }}
        >
          <MoreDots class={ui.icon} />
          More
        </button>
        <button
          type="button"
          class={ui.item}
          onClick={() => {
            props.onOpenSettings()
          }}
        >
          <Settings class={ui.icon} />
          Settings
        </button>
      </nav>

      {/* Portalled out of the workspace, which isolates a stacking context of
          its own (App.module.css `.layout`): a menu left inside it painted
          under Home however high its z-index went - which is how the floating
          version menu, the rail's only other host, became unreachable.

          Mounted with the menu, not with the layout. The layer is fixed
          across the whole viewport at --la-z-shell, and it sat over the app
          for the life of the deck - harmless only for as long as nothing
          disturbs its `pointer-events: none`. */}
      <Show when={moreOpen()}>
        <Portal>
          <div class={ui.menuLayer} data-testid="navrail-more-layer">
            <div
              class={ui.backdrop}
              data-testid="navrail-more-backdrop"
              onClick={() => {
                setMoreOpen(false)
              }}
            />
            <MoreMenu
              items={moreItems()}
              open={moreOpen()}
              onClose={() => {
                setMoreOpen(false)
              }}
              menuClass={ui.menu!}
            />
          </div>
        </Portal>
      </Show>
    </>
  )
}
