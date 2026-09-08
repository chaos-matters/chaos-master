import { executeCommand } from '@/commands/registry'
import { CameraIcon, GridIcon, Redo, Undo } from '@/icons'
import { TouchControlSurface } from './TouchControlSurface'
import ui from './TouchSurface.module.css'
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
  onPickGallery?: () => void
}

export function TabletInspectorDeck(props: TabletInspectorDeckProps) {
  const dispatch = (id: string, ...args: unknown[]) => {
    executeCommand(id, props.ctx, ...args)
  }

  return (
    <aside class={ui.tabletInspectorPane} aria-label="Tablet Touch Inspector">
      <div class={ui.tabletDeckHeader}>
        <button
          type="button"
          class={ui.tabletFlamePickBtn}
          onClick={() => {
            props.onPickGallery?.()
          }}
          title="Browse & load flame from gallery"
          aria-label="Browse & load flame from gallery"
        >
          <GridIcon class={ui.tabletFlamePickIcon} />
          <div class={ui.tabletFlameMeta}>
            <span class={ui.tabletDeckTitle}>
              {props.flame().metadata?.name || 'Chaos Master'}
            </span>
            <span class={ui.tabletDeckSub}>Browse Gallery</span>
          </div>
          <span class={ui.tabletFlameBadge}>Choose</span>
        </button>

        <div class={ui.hudActions}>
          <button
            type="button"
            class={ui.hudButton}
            title="Undo"
            aria-label="Undo"
            disabled={props.canUndo ? !props.canUndo() : false}
            onClick={() => {
              if (props.onUndo) props.onUndo()
              else dispatch('history.undo')
            }}
          >
            <Undo class={ui.hudButtonIcon} />
          </button>
          <button
            type="button"
            class={ui.hudButton}
            title="Redo"
            aria-label="Redo"
            disabled={props.canRedo ? !props.canRedo() : false}
            onClick={() => {
              if (props.onRedo) props.onRedo()
              else dispatch('history.redo')
            }}
          >
            <Redo class={ui.hudButtonIcon} />
          </button>
          <button
            type="button"
            class={ui.hudButton}
            title="Flash Export (Instant PNG)"
            aria-label="Flash Export (Instant PNG)"
            onClick={() => {
              if (props.onSnapshot) props.onSnapshot()
              else dispatch('flame.quickExport')
            }}
          >
            <CameraIcon class={ui.hudButtonIcon} />
          </button>
        </div>
      </div>

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
    </aside>
  )
}
