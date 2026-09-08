import { createSignal, Show } from 'solid-js'
import { executeCommand } from '@/commands/registry'
import { CameraIcon, Download, Home, Redo, Shuffle, SidebarPanel, Sparkle, Undo, } from '@/icons'
import { createHorizontalScrollDrag } from '@/utils/createHorizontalScrollDrag'
import ui from './TouchSurface.module.css'
import type { Accessor } from 'solid-js'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export interface TouchHUDProps {
  ctx: CommandContext
  flame: Accessor<FlameDescriptor>
  canUndo?: Accessor<boolean>
  canRedo?: Accessor<boolean>
  onUndo?: () => void
  onRedo?: () => void
  onFlashExport?: () => void
  onOpenExportModal?: () => void
  onRandomize?: () => void
  onMutate?: () => void
  onSnapshot?: () => void
  onOpenDrawer?: () => void
  onPickGallery?: () => void
}

function MoreDotsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      class={ui.hudButtonIcon}
      fill="currentColor"
      stroke="none"
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  )
}

export function TouchHUD(props: TouchHUDProps) {
  const [showTitleTooltip, setShowTitleTooltip] = createSignal(false)
  const [moreMenuOpen, setMoreMenuOpen] = createSignal(false)
  const [controlsRailEl, setControlsRailEl] = createSignal<HTMLDivElement>()
  createHorizontalScrollDrag(controlsRailEl, { draggingClass: ui.isDragging })

  const dispatch = (id: string, ...args: unknown[]) => {
    executeCommand(id, props.ctx, ...args)
  }

  const flameName = () => props.flame().metadata?.name?.trim() || 'Chaos Master'

  const handleFlashExport = () => {
    if (props.onFlashExport) props.onFlashExport()
    else if (props.onSnapshot) props.onSnapshot()
    else dispatch('flame.quickExport')
  }

  const handleOpenExportModal = () => {
    if (props.onOpenExportModal) props.onOpenExportModal()
    else dispatch('export.png')
  }

  return (
    <header class={ui.topHud} role="banner" aria-label="Touch Navigation HUD">
      {/* 1. Home / Gallery button */}
      <button
        type="button"
        class={ui.hudHomeBtn}
        onClick={() => {
          props.onPickGallery?.()
        }}
        title="Browse & load flames from gallery"
        aria-label="Browse & load flames from gallery"
      >
        <Home class={ui.hudButtonIcon} />
      </button>

      {/* 2. Truncated Title with tap tooltip */}
      <div class={ui.hudTitleWrapper}>
        <button
          type="button"
          class={ui.hudTitleBtn}
          onClick={() => {
            setShowTitleTooltip((prev) => !prev)
          }}
          title={flameName()}
          aria-label={`Flame title: ${flameName()}`}
        >
          <span class={ui.hudTitleText}>{flameName()}</span>
        </button>

        <Show when={showTitleTooltip()}>
          <div
            class={ui.popoverBackdrop}
            onClick={() => setShowTitleTooltip(false)}
          />
          <div class={ui.titleTooltip} role="tooltip">
            <strong>{flameName()}</strong>
            <Show when={props.flame().metadata?.description}>
              <div style={{ 'margin-top': '4px', opacity: '0.8' }}>
                {props.flame().metadata?.description}
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* 3. Controls Rail */}
      <div
        ref={setControlsRailEl}
        class={ui.controlsRail}
        role="toolbar"
        aria-label="Controls"
      >
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
          title="Snapshot PNG"
          aria-label="Snapshot PNG"
          onClick={handleFlashExport}
        >
          <CameraIcon class={ui.hudButtonIcon} />
        </button>
      </div>

      {/* 4. More (...) Menu */}
      <div class={ui.moreMenuWrapper}>
        <button
          type="button"
          class={ui.hudButton}
          title="More Options"
          aria-label="More Options"
          aria-expanded={moreMenuOpen()}
          onClick={() => setMoreMenuOpen((o) => !o)}
        >
          <MoreDotsIcon />
        </button>

        <Show when={moreMenuOpen()}>
          <div
            class={ui.popoverBackdrop}
            onClick={() => setMoreMenuOpen(false)}
          />
          <div
            class={ui.moreMenuPopover}
            role="menu"
            aria-label="More Options Menu"
          >
            <button
              type="button"
              role="menuitem"
              class={ui.moreMenuItem}
              onClick={() => {
                setMoreMenuOpen(false)
                if (props.onMutate) props.onMutate()
                else dispatch('flame.mutate')
              }}
            >
              <Sparkle class={ui.moreMenuIcon} />
              <span>Mutate Flame</span>
            </button>

            <button
              type="button"
              role="menuitem"
              class={ui.moreMenuItem}
              onClick={() => {
                setMoreMenuOpen(false)
                if (props.onRandomize) props.onRandomize()
                else dispatch('flame.randomize')
              }}
            >
              <Shuffle class={ui.moreMenuIcon} />
              <span>Randomize Flame</span>
            </button>

            <button
              type="button"
              role="menuitem"
              class={ui.moreMenuItem}
              onClick={() => {
                setMoreMenuOpen(false)
                handleOpenExportModal()
              }}
            >
              <Download class={ui.moreMenuIcon} />
              <span>Full Export (Options & Animation)…</span>
            </button>

            <Show when={props.onOpenDrawer}>
              <button
                type="button"
                role="menuitem"
                class={ui.moreMenuItem}
                onClick={() => {
                  setMoreMenuOpen(false)
                  props.onOpenDrawer?.()
                }}
              >
                <SidebarPanel class={ui.moreMenuIcon} />
                <span>Advanced Tools</span>
              </button>
            </Show>
          </div>
        </Show>
      </div>
    </header>
  )
}
