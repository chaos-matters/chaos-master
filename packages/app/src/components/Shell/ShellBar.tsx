import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { MoreDots } from '@/icons'
import { createBackLayer } from '@/lib/backStack'
import { DESTINATIONS, tickForDestination } from './destinations'
import { MoreMenu } from './MoreMenu'
import { buildMoreMenu } from './moreMenuItems'
import ui from './ShellBar.module.css'
import type { Accessor } from 'solid-js'
import type { ShellDestination } from './destinations'
import type { MoreMenuHandlers } from './moreMenuItems'

export type { ShellDestination } from './destinations'

/**
 * How long the capsule stays expanded once the finger has left it. Long
 * enough to read the bar and reach it, short enough that the editor gets its
 * band back without being told to.
 */
export const CAPSULE_OPEN_MS = 3000

export interface ShellBarProps {
  /** `capsule` is Create: the bar collapses so the editor keeps its canvas. */
  mode: 'full' | 'capsule'
  current: Accessor<ShellDestination>
  onSelect: (destination: ShellDestination) => void
  /** Absent where there is nothing to put in it: the capsule offers no More,
   *  because the editor's top bar already carries the same list. */
  more?: MoreMenuHandlers
}

/**
 * The phone's shell: Create and Library, and More beside them. On Library it
 * is the whole bar; in Create it is a single capsule docked at the leading
 * end of the rail, which expands over the rail while it is wanted and then
 * gives the band back (A/screens.md 27).
 *
 * The platform difference is in the stylesheet only: the floating glass pill
 * everywhere, and Android's full-width Material bar with permanent labels.
 */
export function ShellBar(props: ShellBarProps) {
  const [expanded, setExpanded] = createSignal(false)
  const [held, setHeld] = createSignal(false)
  /**
   * The keyboard is working in the bar: one of its buttons has the focus,
   * and the focus came from the keys. Chrome focuses a tapped button as well,
   * without the ring, and that focus keeps nothing up: a bar a finger opened
   * still gives the editor its band back on the countdown.
   */
  const [keyboardIn, setKeyboardIn] = createSignal(false)
  const [moreOpen, setMoreOpen] = createSignal(false)
  /** Escape and back hand focus back to it (MoreMenu's `trigger`). */
  let moreButton: HTMLButtonElement | undefined
  let dockEl: HTMLDivElement | undefined

  const isCapsule = (destination: ShellDestination) =>
    props.mode === 'capsule' && destination === 'create'
  const open = () => props.mode === 'full' || expanded()
  const moreItems = () => buildMoreMenu(props.more ?? {})
  const moreShowing = () => props.mode === 'full' && moreOpen()

  /**
   * Whether the touch currently on the capsule is the one that opened the
   * bar. The click that ends that touch must not shut what it just opened -
   * but a tap on a bar that is already up is a dismissal, and without this
   * only back or the countdown closed it while it covered the chip row.
   */
  let openedOnDown = false

  const collapse = () => {
    setExpanded(false)
    openedOnDown = false
  }

  // A finger resting on the capsule is a request to keep the bar up, so the
  // countdown only runs once nothing is holding it.
  //
  // The keyboard working in the bar holds it too: the countdown ran from the
  // open whatever had the focus, and Library went from under a keyboard user
  // three seconds after it appeared. Reading keyboardIn restarts the
  // countdown when the focus leaves. The countdown still runs while the keys
  // hold the bar, and looks again when it ends, because a button that leaves
  // the page or turns inert with the focus in it takes the focus with it and
  // fires no focusout: the bar would otherwise stay up for good.
  createEffect(() => {
    if (props.mode === 'full' || !expanded() || held()) return
    keyboardIn()
    let timer: ReturnType<typeof setTimeout>
    const end = () => {
      if (keyboardIn() && dockEl?.contains(document.activeElement)) {
        timer = setTimeout(end, CAPSULE_OPEN_MS)
        return
      }
      collapse()
    }
    timer = setTimeout(end, CAPSULE_OPEN_MS)
    onCleanup(() => {
      clearTimeout(timer)
    })
  })

  /**
   * Whether the focus that just arrived came from the keys. The browser
   * already decides that for its own focus ring, and :focus-visible asks it.
   */
  function focusFromKeys(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false
    try {
      return target.matches(':focus-visible')
    } catch {
      // No :focus-visible is Safari before 15.4, which never focuses a
      // tapped button: a focus there came from the keys.
      return true
    }
  }

  // Expanded over the rail, the bar is the topmost layer: back gives the
  // editor its band back before anything else answers (lib/backStack.ts).
  createBackLayer(expanded, collapse, 'shell bar')

  /**
   * The capsule opens on the touch down and stays up while the finger rests
   * on it; the countdown starts when the finger leaves. The release is
   * watched on the document rather than on this button, and the pointer is
   * deliberately not captured: a captured pointer reports its release back to
   * the capsule wherever the finger actually went, so the bar collapsed under
   * a finger that had slid onto Library. Not capturing does not let that
   * finger select Library either - a touch pointer has implicit capture, and
   * the compatibility click lands on the nearest common ancestor - what it
   * does is keep the bar up, which is the part a slide needs.
   *
   * The hold belongs to the pointer that started it, and keeps belonging to
   * it. The listener was pointer-agnostic, so a second finger lifting
   * anywhere ended the hold while the first was still resting on the capsule;
   * a second finger landing on the capsule did the same thing from the other
   * side, by re-entering the hold and aborting the first finger's listener.
   * Either way the real release went unheard.
   */
  let releasing: AbortController | undefined
  /** The pointer whose hold is live, while it is live. */
  let holdingPointer: number | undefined
  onCleanup(() => {
    releasing?.abort()
  })

  function holdCapsule(pointerId: number) {
    if (holdingPointer !== undefined) return
    // A hold that ended without its pointer (see the blur below) leaves its
    // listeners waiting for a release that may never come; the new press
    // owns the capsule from here.
    releasing?.abort()
    holdingPointer = pointerId
    openedOnDown = !expanded()
    setExpanded(true)
    setHeld(true)
    const controller = new AbortController()
    releasing = controller
    /** Stop keeping the bar up. The countdown to collapse starts here. */
    const endHold = () => {
      holdingPointer = undefined
      setHeld(false)
    }
    /**
     * The pointer is done with: stop listening for it, and retire the flag
     * that tells the click "this touch opened the bar" when no click is
     * coming. Nothing follows a cancelled touch and nothing follows a
     * release the page never saw, so the flag would otherwise outlive the
     * touch and swallow the next keyboard activation on the capsule.
     */
    const endPointer = (clickFollows: boolean) => {
      endHold()
      controller.abort()
      releasing = undefined
      if (!clickFollows) openedOnDown = false
    }
    const release = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      endPointer(event.type === 'pointerup')
    }
    const options = { signal: controller.signal }
    document.addEventListener('pointerup', release, options)
    document.addEventListener('pointercancel', release, options)
    // A mouse button released outside the window reports its release to
    // nobody in here, so the hold never ended: the bar stayed held open over
    // the chip row, its countdown could not start, and holdCapsule's own
    // guard turned every later press away for the life of the component. A
    // pointer moving over the page again with no button down says the
    // release already happened, and brings no click with it.
    document.addEventListener(
      'pointermove',
      (event: PointerEvent) => {
        if (event.pointerId !== pointerId || event.buttons !== 0) return
        endPointer(false)
      },
      options,
    )
    // Losing focus - alt-tab, a permission dialog, any system surface over
    // the app - says nothing about the finger. It is still down, and its
    // release is still coming with a click behind it. So this ends the hold
    // and leaves the pointer's own listeners in place: treating it as a
    // release instead disarmed that click, and the click then read as a tap
    // on an open bar and shut it the moment the finger lifted - the exact
    // symptom the capsule fix removed, back under any focus loss.
    window.addEventListener('blur', endHold, options)
  }

  function select(destination: ShellDestination) {
    tickForDestination(destination, props.current())
    props.onSelect(destination)
  }

  return (
    <div
      class={ui.dock}
      classList={{
        [ui.capsuleDock!]: props.mode === 'capsule',
        [ui.expanded!]: expanded(),
      }}
      ref={dockEl}
      onFocusIn={(event) => {
        setKeyboardIn(focusFromKeys(event.target))
      }}
      onFocusOut={(event) => {
        // Between two of the bar's own buttons the focusin that follows
        // decides; only a focus leaving the bar lets it go.
        const next = event.relatedTarget
        if (next instanceof Node && dockEl?.contains(next)) return
        setKeyboardIn(false)
      }}
    >
      {/* More is the full bar's, and only the full bar's: in Create the top
          bar already carries the same list, and a popover opened from inside
          the rail's peek row would be clipped by the sheet. */}
      <Show when={moreShowing()}>
        <div
          class={ui.backdrop}
          data-testid="shell-more-backdrop"
          onClick={() => {
            setMoreOpen(false)
          }}
        />
      </Show>
      <MoreMenu
        items={moreItems()}
        open={moreShowing()}
        onClose={() => {
          setMoreOpen(false)
        }}
        menuClass={ui.menu!}
        trigger={() => moreButton}
      />

      <div class={ui.row}>
        <nav class={ui.bar} aria-label="Destinations">
          <For each={DESTINATIONS}>
            {(destination) => (
              <Show when={open() || isCapsule(destination.id)}>
                <button
                  type="button"
                  class={ui.item}
                  classList={{ [ui.capsule!]: isCapsule(destination.id) }}
                  // Collapsed, the capsule is the whole shell, so it says what
                  // it opens rather than only where it goes.
                  aria-label={
                    isCapsule(destination.id) ? 'Create, navigation' : undefined
                  }
                  aria-expanded={
                    isCapsule(destination.id) ? expanded() : undefined
                  }
                  aria-current={
                    props.current() === destination.id ? 'page' : undefined
                  }
                  onPointerDown={(event) => {
                    if (!isCapsule(destination.id)) return
                    holdCapsule(event.pointerId)
                  }}
                  onClick={() => {
                    if (isCapsule(destination.id)) {
                      if (openedOnDown) {
                        // The release of the very touch that opened the bar:
                        // toggling here shut it again the moment the finger
                        // lifted.
                        openedOnDown = false
                        return
                      }
                      // A tap on a bar that was already up puts it away.
                      // Keyboard activation brings no pointer down at all,
                      // so this is also what opens the bar for it.
                      if (expanded()) collapse()
                      else setExpanded(true)
                      return
                    }
                    select(destination.id)
                  }}
                >
                  <span class={ui.glyph}>
                    <destination.Icon class={ui.icon} />
                  </span>
                  <span class={ui.label}>{destination.label}</span>
                </button>
              </Show>
            )}
          </For>
        </nav>

        {/* The list is never empty - the Arcade defaults into it
            (Shell/moreMenuItems.ts) - and Home mounts this bar with no handlers at
            all, so that one item is Home's only way into the Arcade. The
            length guard that stood here could not fire. */}
        <Show when={props.mode === 'full'}>
          <button
            ref={moreButton}
            type="button"
            class={ui.more}
            aria-label="More"
            aria-expanded={moreOpen()}
            onClick={() => {
              setMoreOpen((was) => !was)
            }}
          >
            <MoreDots class={ui.icon} />
          </button>
        </Show>
      </div>
    </div>
  )
}
