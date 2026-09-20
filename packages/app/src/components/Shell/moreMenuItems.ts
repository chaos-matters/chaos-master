import { Book, Bookmark, Download, GaugeMax, Info, Menu, Share, SidebarPanel, Zap, } from '@/icons'
import { setActiveTab } from '@/lib/activeTab'
import type { Component } from 'solid-js'

/**
 * The one More list. Every surface that offers More renders it - the editor's
 * top bar, the phone's shell bar, the tablet's navigation rail - so an item
 * added here shows up wherever More is offered. An item whose handler is
 * absent is not offered: the host decides what this device can do (the
 * Benchmark Lab is a page of its own and web only, the desktop layout is not
 * a native option).
 *
 * The Arcade is the exception, and defaults. It is reachable from every touch
 * surface and is the one destination this phase does not put in the bar, so
 * three hosts were restating the same one-line handler - and the rail, which
 * did not, was a dead end on a landscape tablet.
 *
 * So the list is never empty, and no surface guards against an empty More:
 * `buildMoreMenu({})` is the Arcade alone, which is exactly what the bar over
 * Home offers and its only way in.
 *
 * The names are the props `TouchHUDProps` already carries, so a surface can
 * pass its own props straight in.
 */
export interface MoreMenuHandlers {
  /** The user's own save: the one write allowed to replace a flame they
   *  kept, because it asks first. First in the list because the notice a
   *  launch shows when Recents could not take a restored flame tells the
   *  user to make it, and on a touch layout there was nothing to tap. */
  onSaveForLater?: () => void
  onOpenExportModal?: () => void
  onShare?: () => void
  onOpenDrawer?: () => void
  onOpenArcade?: () => void
  onOpenDocs?: () => void
  onOpenBenchmark?: () => void
  onOpenBenchmarkLab?: () => void
  onOpenSettings?: () => void
  onDesktopLayout?: () => void
}

export interface MoreMenuItem {
  readonly label: string
  readonly Icon: Component<{ class?: string }>
  readonly run: () => void
}

export function buildMoreMenu(
  handlers: MoreMenuHandlers,
): readonly MoreMenuItem[] {
  const table: readonly {
    label: string
    Icon: Component<{ class?: string }>
    run: (() => void) | undefined
  }[] = [
    { label: 'Save for later', Icon: Bookmark, run: handlers.onSaveForLater },
    {
      label: 'Export options',
      Icon: Download,
      run: handlers.onOpenExportModal,
    },
    { label: 'Share link', Icon: Share, run: handlers.onShare },
    { label: 'Advanced tools', Icon: SidebarPanel, run: handlers.onOpenDrawer },
    {
      label: 'Lumen Arcade',
      Icon: Zap,
      run:
        handlers.onOpenArcade ??
        (() => {
          setActiveTab('arcade')
        }),
    },
    { label: 'Documentation', Icon: Book, run: handlers.onOpenDocs },
    {
      label: 'Quick GPU benchmark',
      Icon: Zap,
      run: handlers.onOpenBenchmark,
    },
    {
      label: 'Benchmark Lab',
      Icon: GaugeMax,
      run: handlers.onOpenBenchmarkLab,
    },
    { label: 'Settings and more', Icon: Info, run: handlers.onOpenSettings },
    { label: 'Desktop layout', Icon: Menu, run: handlers.onDesktopLayout },
  ]
  return table.filter((item): item is MoreMenuItem => item.run !== undefined)
}
