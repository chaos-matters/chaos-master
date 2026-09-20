import { createSignal, Show } from 'solid-js'
import { executeCommand } from '@/commands/registry'
import { CameraIcon, GridIcon, Redo, SidebarPanel, Undo } from '@/icons'
import { workspaceIsVisible } from '@/lib/activeTab'
import { haptic } from '@/lib/haptics'
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
  onSnapshot?: () => void
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

  const dispatch = (id: string, ...args: unknown[]) => {
    executeCommand(id, props.ctx, ...args)
  }

  const flameName = () =>
    props.flame().metadata?.name?.trim() || 'Untitled flame'

  /**
   * Dragging the divider: the deck's leading edge follows the finger 1:1, so
   * moving left (a smaller clientX) makes the deck wider. Each gesture keeps
   * its own start point, and a second touch ends it (createDragHandler).
   */
  const startDividerDrag = createDragHandler(
    (initEvent) => {
      const startX = initEvent.clientX
      const startWidth = width()
      return {
        onPointerMove(event) {
          const next = startWidth + (startX - event.clientX)
          setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)))
        },
        onDone() {
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
      if (props.onSnapshot) props.onSnapshot()
      else dispatch('flame.quickExport')
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
            onSnapshot={props.onSnapshot}
            onPickGallery={props.onPickGallery}
          />
        </div>
      </aside>
    </Show>
  )
}
