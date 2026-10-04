import { createEffect, createSignal, onCleanup, Show } from 'solid-js'
import { executeCommand } from '@/commands/registry'
import { CameraIcon, GridIcon, Redo, SidebarPanel, Undo } from '@/icons'
import { workspaceIsVisible } from '@/lib/activeTab'
import { setDeckResizing, setTrailingCover } from '@/lib/canvasFraming'
import { glassAllowed } from '@/lib/glass'
import { haptic } from '@/lib/haptics'
import glass from '@/styles/designSystem/glass.module.css'
import { createDragHandler } from '@/utils/createDragHandler'
import { createLongPress } from '@/utils/createLongPress'
import { persistentSignal } from '@/utils/persistentSignal'
import ui from './TabletDeck.module.css'
import { TouchControlSurface } from './TouchControlSurface'
import type { Accessor } from 'solid-js'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export interface TabletInspectorDeckProps {
  ctx: CommandContext
  flame: Accessor<FlameDescriptor>
  onOpenDrawer?: () => void
  onRandomize?: () => void
  onMutate?: () => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: Accessor<boolean>
  canRedo?: Accessor<boolean>
  /** The save button's tap. Required: its fallback dispatched
   *  `flame.quickExport`, a command no one ever registered. */
  onSnapshot: () => void
  /** Offered on a long press of the save button, as on the phone's shutter. */
  onOpenExportOptions?: () => void
  onPickGallery?: () => void
}

const MIN_WIDTH = 320
const MAX_WIDTH = 480

/** Only used the first time; after that the user's own width is restored. */
function defaultWidth(): number {
  if (typeof window === 'undefined') return 380
  return window.innerWidth > window.innerHeight ? 380 : 360
}

/**
 * The tablet's inspector, on the trailing edge of the deck layout. While glass
 * panels show (lib/glass.ts, glassAllowed: the setting, on by default, with
 * neither Reduce Transparency nor More Contrast asked for), it floats over the
 * canvas as glass: the canvas runs on under it, and the deck says how much of
 * the canvas it covers so the camera frames the flame in the rest
 * (lib/canvasFraming.ts). Otherwise it is a page beside the canvas, opaque,
 * in a grid column of its own. Collapsed, it covers nothing either way.
 */
export function TabletInspectorDeck(props: TabletInspectorDeckProps) {
  // The live width is a plain signal. The persisted one is read once for the
  // starting width and written once when the divider is let go: serialising
  // JSON into localStorage on every pointermove is a synchronous write per
  // frame of the drag.
  const [storedWidth, setStoredWidth] = persistentSignal<number>(
    'chaos-tablet-deck-width',
    defaultWidth(),
  )
  const [width, setWidth] = createSignal(storedWidth())
  // Not persisted: a collapsed deck should not be how the app starts.
  const [collapsed, setCollapsed] = createSignal(false)

  // What the open deck covers of the canvas under it, as the divider moves:
  // its width while it floats, nothing while it is a page beside the canvas.
  // The camera moves the picture by it and writes nothing to the flame.
  const floating = () => glassAllowed()
  createEffect(() => {
    setTrailingCover(floating() && !collapsed() ? width() : 0)
  })
  onCleanup(() => {
    setTrailingCover(0)
  })

  const dispatch = (id: string, ...args: unknown[]) => {
    executeCommand(id, props.ctx, ...args)
  }

  const flameName = () =>
    props.flame().metadata?.name?.trim() || 'Untitled flame'

  /**
   * Dragging the divider: the deck's leading edge follows the finger 1:1, so
   * moving left (a smaller clientX) makes the deck wider. Each gesture keeps
   * its own start point, and a second touch ends it (createDragHandler).
   * From its first move to its end it says the canvas is resizing, which the
   * glass busy switch reads: a press that does not move is half of the
   * double tap that collapses the deck.
   */
  const startDividerDrag = createDragHandler(
    (initEvent) => {
      const startX = initEvent.clientX
      const startWidth = width()
      return {
        onPointerMove(event) {
          setDeckResizing(true)
          const next = startWidth + (startX - event.clientX)
          setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)))
        },
        onDone() {
          setDeckResizing(false)
          if (width() !== storedWidth()) setStoredWidth(width())
        },
      }
    },
    // Preventing the default on the pointer down would swallow the double tap
    // that collapses the deck.
    { preventDefault: false },
  )

  // The same pair the rail's shutter offers: tap saves, hold opens the options.
  const saveHandlers = createLongPress({
    onPressStart: () => {
      haptic.impactLight()
    },
    onTap: () => {
      props.onSnapshot()
    },
    onLongPress:
      props.onOpenExportOptions && (() => props.onOpenExportOptions?.()),
  })

  function toggleCollapsed() {
    setCollapsed((open) => !open)
    haptic.impactLight()
  }

  return (
    // Home and the Arcade cover this layout the way they cover the phone's,
    // and the deck stays mounted underneath them - so the same attribute on
    // the same condition (EditorRail.tsx). It matters more here: the rail the
    // phone marks inert is not mounted on this layout at all, and the deck is
    // expanded under Home with its header, its chips and every variation tile
    // still in the tab order.
    <Show
      when={!collapsed()}
      fallback={
        <button
          type="button"
          class={ui.edgeTab}
          // Floating, the tab is chrome like the rest of the glass: blurred
          // art behind the icon, rather than the sharp art that shows
          // through its fill today.
          classList={{ [glass.chrome!]: floating() }}
          aria-label="Show inspector"
          inert={!workspaceIsVisible()}
          onClick={toggleCollapsed}
        >
          <SidebarPanel class={ui.iconButtonIcon} />
        </button>
      }
    >
      <aside
        class={ui.deck}
        classList={{
          [ui.page!]: !floating(),
          [ui.floating!]: floating(),
          [glass.panel!]: floating(),
        }}
        aria-label="Tablet Touch Inspector"
        inert={!workspaceIsVisible()}
        style={{ width: `${width()}px` }}
      >
        <div
          class={ui.divider}
          data-testid="deck-divider"
          onPointerDown={startDividerDrag}
          onDblClick={toggleCollapsed}
        />

        <div class={ui.header}>
          <button
            type="button"
            class={ui.iconButton}
            title="Library"
            aria-label="Library"
            onClick={() => {
              props.onPickGallery?.()
            }}
          >
            <GridIcon class={ui.iconButtonIcon} />
          </button>

          <span class={ui.title} title={flameName()}>
            {flameName()}
          </span>

          <button
            type="button"
            class={ui.iconButton}
            title="Undo"
            aria-label="Undo"
            disabled={props.canUndo ? !props.canUndo() : false}
            onPointerDown={() => {
              haptic.impactLight()
            }}
            onClick={() => {
              if (props.onUndo) props.onUndo()
              else dispatch('history.undo')
            }}
          >
            <Undo class={ui.iconButtonIcon} />
          </button>
          <button
            type="button"
            class={ui.iconButton}
            title="Redo"
            aria-label="Redo"
            disabled={props.canRedo ? !props.canRedo() : false}
            onPointerDown={() => {
              haptic.impactLight()
            }}
            onClick={() => {
              if (props.onRedo) props.onRedo()
              else dispatch('history.redo')
            }}
          >
            <Redo class={ui.iconButtonIcon} />
          </button>
          <button
            type="button"
            class={ui.iconButton}
            title="Save image"
            aria-label="Save image"
            {...saveHandlers}
          >
            <CameraIcon class={ui.iconButtonIcon} />
          </button>
        </div>

        <div class={ui.body}>
          <TouchControlSurface
            ctx={props.ctx}
            flame={props.flame}
            mode="tablet-deck"
            onOpenDrawer={props.onOpenDrawer}
            onRandomize={props.onRandomize}
            onMutate={props.onMutate}
            onUndo={props.onUndo}
            onRedo={props.onRedo}
            canUndo={props.canUndo}
            canRedo={props.canRedo}
            onPickGallery={props.onPickGallery}
          />
        </div>
      </aside>
    </Show>
  )
}
