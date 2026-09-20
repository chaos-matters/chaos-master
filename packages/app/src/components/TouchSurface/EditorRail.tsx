import { children, createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, } from 'solid-js'
import { CameraIcon, ColourWedge, ShapeTriangle, Shuffle, VariationSpiral, } from '@/icons'
import { workspaceIsVisible } from '@/lib/activeTab'
import { createBackLayer } from '@/lib/backStack'
import { haptic } from '@/lib/haptics'
import { createDragHandler } from '@/utils/createDragHandler'
import { createLongPress } from '@/utils/createLongPress'
import { clampSheetHeight, detentHeights, FLICK_MAX_AGE_MS, heightOf, nearestDetent, PEEK_HEIGHT, railDetent, setRailDetent, settleDetent, SHEET_TRANSITION_MS, } from './detents'
import ui from './EditorRail.module.css'
import { TouchControlSurface } from './TouchControlSurface'
import type { JSX } from 'solid-js'
import type { Detent } from './detents'
import type { EditorRailProps, TouchTab } from './types'

const CHIPS: readonly {
  readonly tab: TouchTab
  readonly label: string
  readonly Icon: (props: { class?: string }) => JSX.Element
}[] = [
  { tab: 'variations', label: 'Variations', Icon: VariationSpiral },
  { tab: 'shape', label: 'Shape', Icon: ShapeTriangle },
  { tab: 'colour', label: 'Colour', Icon: ColourWedge },
  { tab: 'vary', label: 'Vary', Icon: Shuffle },
]

/**
 * The visual viewport, so an open keyboard shrinks the sheet with it rather
 * than pushing it off screen.
 */
function viewportHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight
}

/**
 * One surface at the bottom of the editor at three detents (detents.ts), and
 * the only place a phone reaches its tools from. It is never dismissed: peek
 * is the floor, so the chips and the shutter are always one tap away.
 */
export function EditorRail(props: EditorRailProps) {
  // The detent lives in detents.ts so it survives this component (the
  // threshold between the rail and the tablet deck remounts it).
  const detent = railDetent
  const setDetent = setRailDetent
  const [tab, setTab] = createSignal<TouchTab>('variations')
  const [vh, setVh] = createSignal(viewportHeight())
  const [chrome, setChrome] = createSignal(0)
  const [dragHeight, setDragHeight] = createSignal<number | null>(null)
  const heights = createMemo(() => detentHeights(vh(), vh() - chrome()))
  const sheetHeight = () =>
    dragHeight() ?? clampSheetHeight(heightOf(detent(), heights()), heights())

  /**
   * Resolved once. `leading` is written as a JSX attribute, which compiles to
   * a getter, so reading it in the Show and again in the body built two shell
   * bars per mount - the first one left alive, with its signals, effects and
   * collapse timer, under the Show's memo until the rail disposed.
   */
  const leading = children(() => props.leading)

  let dockEl: HTMLElement | undefined
  let sheetEl: HTMLDivElement | undefined
  let bodyEl: HTMLDivElement | undefined

  /**
   * What the sheet may not grow into, read back from the dock's own padding:
   * above it the top bar and the gap under it, below it the home indicator.
   * Both are built from env() insets, which only the resolved style knows,
   * and the dock is inert, so the padding blocks nothing.
   */
  function measureChrome() {
    if (!dockEl) return
    const style = window.getComputedStyle(dockEl)
    const top = Number.parseFloat(style.paddingTop)
    const bottom = Number.parseFloat(style.paddingBottom)
    setChrome(
      (Number.isFinite(top) ? top : 0) + (Number.isFinite(bottom) ? bottom : 0),
    )
  }

  onMount(() => {
    measureChrome()
    const onResize = () => {
      setVh(viewportHeight())
      // The safe areas change with the orientation, so the chrome does too.
      measureChrome()
    }
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    onCleanup(() => {
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
    })
  })

  // How much of the viewport the sheet covers above peek, reported whenever
  // it changes and not only when a gesture settles: a rotation moves the
  // detents, and leaving the rail (the desktop layout, or a tablet growing
  // into the deck) must hand the canvas its full height back.
  createEffect(() => {
    const target = detent()
    const measured = heights()
    props.onCoveredHeightChange?.(
      target === 'peek'
        ? 0
        : clampSheetHeight(heightOf(target, measured), measured) - PEEK_HEIGHT,
    )
  })
  onCleanup(() => {
    props.onCoveredHeightChange?.(0)
  })

  /**
   * The panel follows the finger while a drag is on and the settled detent
   * otherwise: a drag from peek grows a sheet that is already filled, and a
   * collapse keeps its contents until the height has finished shrinking,
   * instead of emptying the glass and then closing it. Once built it stays
   * mounted and is hidden at peek, where display:none pauses the variation
   * previews through their IntersectionObserver; remounting would rebuild
   * every WebGPU context and snapshot on the next tap.
   *
   * Reading the settled height here would hide the panel the user is typing
   * in: the detent heights floor at peek, so a keyboard that leaves a
   * landscape phone 180px of viewport collapses medium onto peek while the
   * sheet is still at medium.
   */
  const bodyOpen = createMemo(() => {
    const dragging = dragHeight()
    return dragging === null ? detent() !== 'peek' : dragging > PEEK_HEIGHT
  })
  const [bodyShown, setBodyShown] = createSignal(false)
  const [bodyBuilt, setBodyBuilt] = createSignal(false)
  const [bodyFocused, setBodyFocused] = createSignal(false)

  createEffect(() => {
    if (bodyOpen()) {
      setBodyBuilt(true)
      setBodyShown(true)
      return
    }
    if (!bodyShown()) return
    // display:none takes the focus out of whatever holds it, and the keyboard
    // goes with it. A panel being typed in waits, clipped, for the focus to
    // leave: this effect runs again when it does. The event is what makes the
    // wait reactive, the DOM is what makes it true - an element removed while
    // focused does not always report the focus leaving.
    if (bodyFocused() && bodyEl?.contains(document.activeElement)) return
    const timer = setTimeout(() => {
      setBodyShown(false)
    }, SHEET_TRANSITION_MS)
    onCleanup(() => {
      clearTimeout(timer)
    })
  })

  function settle(target: Detent) {
    if (target !== detent()) {
      setDetent(target)
      haptic.impactLight()
    }
  }

  /**
   * An open sheet is a layer, so back closes it one step at a time: large to
   * medium, medium to peek (A/screens.md 0.5). The registration keys off
   * "open or not" rather than off the detent itself, so changing detent does
   * not re-push the handler above whatever opened over the rail meanwhile.
   */
  const railOpen = createMemo(() => detent() !== 'peek')
  createBackLayer(
    railOpen,
    () => {
      settle(detent() === 'large' ? 'medium' : 'peek')
    },
    'rail detent',
  )

  function onChip(next: TouchTab) {
    if (detent() === 'peek') {
      setTab(next)
      settle('medium')
    } else if (next === tab()) {
      settle('peek')
    } else {
      setTab(next)
    }
  }

  /**
   * The drag: the sheet tracks the finger 1:1, no easing; velocity in px/ms
   * from the last two samples, positive when the sheet grows. Every gesture
   * keeps its own start point, and a second touch ends it rather than walking
   * the sheet around against one start point (createDragHandler).
   */
  const startGrab = createDragHandler(
    (initEvent) => {
      const startY = initEvent.clientY
      // The height on screen, not the one the transition is heading for:
      // grabbing the sheet while it is still opening used to snap it by
      // whatever distance was left to travel. Committing it here stops the
      // transition with the finger rather than with the first move, which it
      // would otherwise keep outrunning.
      const rendered = sheetEl?.getBoundingClientRect().height ?? 0
      const startHeight = clampSheetHeight(
        rendered > 0 ? rendered : sheetHeight(),
        heights(),
      )
      setDragHeight(startHeight)
      let lastY = initEvent.clientY
      let lastT = initEvent.timeStamp
      let velocity = 0
      let moved = false
      let lastDetent = nearestDetent(startHeight, heights())
      // Both plugins drop a selection tick until a generator is prepared, so
      // the crossings inside the drag stay silent without this pair.
      haptic.selectionStart()

      return {
        onPointerMove(event) {
          moved = true
          const dt = event.timeStamp - lastT
          // A non-positive delta is not a sample: keep the last velocity
          // rather than dividing by zero.
          if (dt > 0) velocity = (lastY - event.clientY) / dt
          lastY = event.clientY
          lastT = event.timeStamp
          const h = clampSheetHeight(
            startHeight + (startY - event.clientY),
            heights(),
          )
          const crossed = nearestDetent(h, heights())
          if (crossed !== lastDetent) {
            haptic.selectionChanged()
            lastDetent = crossed
          }
          setDragHeight(h)
        },
        onDone(event) {
          // A release that trails the last move is a placement, not a flick;
          // so is a drag something else ended, which brings no event at all.
          const flicked =
            event !== undefined && event.timeStamp - lastT <= FLICK_MAX_AGE_MS
          // A tap on the grabber placed nothing: a sheet still opening would
          // settle from wherever the transition had reached and go back.
          const target = moved
            ? settleDetent(sheetHeight(), flicked ? velocity : 0, heights())
            : detent()
          haptic.selectionEnd()
          setDragHeight(null)
          settle(target)
        },
      }
    },
    // The grabber's own touch-action already stops the page from scrolling;
    // preventing the default here would swallow the taps on the row behind it.
    { preventDefault: false },
  )

  // The shutter: tap saves, a long press opens the options.
  const shutterHandlers = createLongPress({
    onPressStart: () => {
      haptic.impactLight()
    },
    onTap: () => {
      props.onQuickExport()
    },
    onLongPress: () => {
      props.onOpenExportOptions()
    },
  })

  const grabHandlers = { onPointerDown: startGrab }

  return (
    // Home and the Arcade cover the editor completely and it stays mounted
    // underneath them, so everything in here is behind a full-screen layer:
    // inert takes it out of the tab order and off the screen reader for as
    // long as that lasts, while every signal, canvas and listener stays
    // exactly where it was. Unmounting instead is what this branch stopped
    // doing, and for good reasons (see the Show that mounts this).
    <section
      class={ui.dock}
      role="region"
      aria-label="Editor controls"
      inert={!workspaceIsVisible()}
      ref={dockEl}
    >
      <div
        class={ui.sheet}
        ref={sheetEl}
        classList={{
          [ui.dragging!]: dragHeight() !== null,
          [ui.opaque!]: bodyShown(),
        }}
        style={{ height: `${sheetHeight()}px` }}
        data-testid="editor-rail-sheet"
        data-detent={detent()}
      >
        <div
          class={ui.grabberRow}
          data-testid="editor-rail-grabber"
          {...grabHandlers}
        >
          <div class={ui.grabber} />
        </div>
        <div class={ui.peekRow}>
          <div class={ui.dragSurface} {...grabHandlers} />
          {/* The shell's capsule docks here, so Create keeps the whole band
              and navigation costs the editor one 56px circle. */}
          <Show when={leading()}>
            <div class={ui.leading} data-testid="editor-rail-leading">
              {leading()}
            </div>
          </Show>
          <div class={ui.chips} role="tablist" aria-label="Tools">
            <For each={CHIPS}>
              {(chip) => (
                <button
                  type="button"
                  role="tab"
                  class={ui.chip}
                  aria-selected={tab() === chip.tab && detent() !== 'peek'}
                  onPointerDown={() => {
                    haptic.impactLight()
                  }}
                  onClick={() => {
                    onChip(chip.tab)
                  }}
                >
                  <chip.Icon class={ui.chipIcon} />
                  {chip.label}
                </button>
              )}
            </For>
          </div>
          <button
            type="button"
            class={ui.shutter}
            aria-label="Save image"
            {...shutterHandlers}
          >
            <CameraIcon class={ui.shutterIcon} />
          </button>
        </div>
        <Show when={bodyBuilt()}>
          <div
            class={ui.body}
            ref={bodyEl}
            data-testid="editor-rail-body"
            hidden={!bodyShown()}
            onFocusIn={() => {
              setBodyFocused(true)
            }}
            onFocusOut={() => {
              setBodyFocused(false)
            }}
          >
            <TouchControlSurface
              ctx={props.ctx}
              flame={props.flame}
              mode="bottom-sheet"
              tab={tab}
              hideTabRow
              hideFooter
              onRandomize={props.onRandomize}
              onMutate={props.onMutate}
              onOpenDrawer={props.onOpenDrawer}
            />
          </div>
        </Show>
      </div>
    </section>
  )
}
