import { createSignal, For, Show } from 'solid-js'
import { executeCommand } from '@/commands/registry'
import { Book, Download, GaugeMax, GridIcon, Info, Menu, Redo, Share, SidebarPanel, Undo, Zap, } from '@/icons'
import { setActiveTab } from '@/lib/activeTab'
import { haptic } from '@/lib/haptics'
import ui from './TouchSurface.module.css'
import type { Accessor, JSX } from 'solid-js'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export interface TouchHUDProps {
  ctx: CommandContext
  flame: Accessor<FlameDescriptor>
  canUndo?: Accessor<boolean>
  canRedo?: Accessor<boolean>
  onUndo?: () => void
  onRedo?: () => void
  onOpenExportModal?: () => void
  onShare?: () => void
  onOpenDrawer?: () => void
  onPickGallery?: () => void
  onOpenSettings?: () => void
  onOpenDocs?: () => void
  onOpenBenchmark?: () => void
  /** Web only: the Benchmark Lab is its own page (DESIGN.md, decision 1). */
  onOpenBenchmarkLab?: () => void
  onDesktopLayout?: () => void
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

interface MoreItem {
  label: string
  Icon: (props: { class?: string }) => JSX.Element
  run: () => void
}

export function TouchHUD(props: TouchHUDProps) {
  const [showTitleTooltip, setShowTitleTooltip] = createSignal(false)
  const [moreMenuOpen, setMoreMenuOpen] = createSignal(false)

  const dispatch = (id: string, ...args: unknown[]) => {
    executeCommand(id, props.ctx, ...args)
  }

  const flameName = () =>
    props.flame().metadata?.name?.trim() || 'Untitled flame'

  /**
   * What the touch layout cannot otherwise reach: the desktop sidebar and the
   * floating version menu are not drawn here. An item whose handler prop is
   * absent is not offered — the caller decides what this device can do.
   */
  const moreItems = (): MoreItem[] => {
    const items: MoreItem[] = []
    if (props.onOpenExportModal) {
      items.push({
        label: 'Export options',
        Icon: Download,
        run: () => props.onOpenExportModal?.(),
      })
    }
    if (props.onShare) {
      items.push({
        label: 'Share link',
        Icon: Share,
        run: () => props.onShare?.(),
      })
    }
    if (props.onOpenDrawer) {
      items.push({
        label: 'Advanced tools',
        Icon: SidebarPanel,
        run: () => props.onOpenDrawer?.(),
      })
    }
    items.push({
      label: 'Lumen Arcade',
      Icon: Zap,
      run: () => {
        setActiveTab('arcade')
      },
    })
    if (props.onOpenDocs) {
      items.push({
        label: 'Documentation',
        Icon: Book,
        run: () => props.onOpenDocs?.(),
      })
    }
    if (props.onOpenBenchmark) {
      items.push({
        label: 'Quick GPU benchmark',
        Icon: Zap,
        run: () => props.onOpenBenchmark?.(),
      })
    }
    if (props.onOpenBenchmarkLab) {
      items.push({
        label: 'Benchmark Lab',
        Icon: GaugeMax,
        run: () => props.onOpenBenchmarkLab?.(),
      })
    }
    if (props.onOpenSettings) {
      items.push({
        label: 'Settings and more',
        Icon: Info,
        run: () => props.onOpenSettings?.(),
      })
    }
    if (props.onDesktopLayout) {
      items.push({
        label: 'Desktop layout',
        Icon: Menu,
        run: () => props.onDesktopLayout?.(),
      })
    }
    return items
  }

  const closePopovers = () => {
    setShowTitleTooltip(false)
    setMoreMenuOpen(false)
  }

  return (
    <>
      {/* Outside the pill on purpose: the pill's backdrop-filter and its
          centring transform make it the containing block for a fixed child,
          so `inset: 0` inside it measured the pill and a tap on the canvas
          never reached this. It sits under the pill and over everything
          else. */}
      <Show when={showTitleTooltip() || moreMenuOpen()}>
        <div
          class={ui.popoverBackdrop}
          data-testid="hud-popover-backdrop"
          onClick={closePopovers}
        />
      </Show>
      <header class={ui.topHud} role="banner" aria-label="Touch Navigation HUD">
        <button
          type="button"
          class={ui.hudButton}
          onClick={() => {
            props.onPickGallery?.()
          }}
          title="Library"
          aria-label="Library"
        >
          <GridIcon class={ui.hudButtonIcon} />
        </button>

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
            <div class={ui.titleTooltip} role="tooltip">
              <strong>{flameName()}</strong>
              <Show when={props.flame().metadata?.description}>
                <div class={ui.titleTooltipBody}>
                  {props.flame().metadata?.description}
                </div>
              </Show>
            </div>
          </Show>
        </div>

        <button
          type="button"
          class={ui.hudButton}
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
          <Undo class={ui.hudButtonIcon} />
        </button>

        <button
          type="button"
          class={ui.hudButton}
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
          <Redo class={ui.hudButtonIcon} />
        </button>

        <div class={ui.moreMenuWrapper}>
          <button
            type="button"
            class={ui.hudButton}
            title="More"
            aria-label="More"
            aria-expanded={moreMenuOpen()}
            onClick={() => setMoreMenuOpen((o) => !o)}
          >
            <MoreDotsIcon />
          </button>

          <Show when={moreMenuOpen()}>
            <div class={ui.moreMenuPopover} role="menu" aria-label="More">
              <For each={moreItems()}>
                {(item) => (
                  <button
                    type="button"
                    role="menuitem"
                    class={ui.moreMenuItem}
                    onClick={() => {
                      setMoreMenuOpen(false)
                      item.run()
                    }}
                  >
                    <item.Icon class={ui.moreMenuIcon} />
                    <span>{item.label}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </header>
    </>
  )
}
