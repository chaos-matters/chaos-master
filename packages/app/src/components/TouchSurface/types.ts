import type { Accessor } from 'solid-js'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export type TouchTab = 'variations' | 'shape' | 'colour' | 'vary'

export type TouchSurfaceMode = 'bottom-sheet' | 'tablet-deck'

export interface TouchControlSurfaceProps {
  ctx: CommandContext
  flame: Accessor<FlameDescriptor>
  mode: TouchSurfaceMode
  initialTab?: TouchTab
  /** When given, the surface follows it and its own tab row is not the source of truth. */
  tab?: Accessor<TouchTab>
  hideTabRow?: boolean
  hideFooter?: boolean
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

export interface EditorRailProps {
  ctx: CommandContext
  flame: Accessor<FlameDescriptor>
  onRandomize: () => void
  onMutate: () => void
  onQuickExport: () => void
  onOpenExportOptions: () => void
  onOpenDrawer?: () => void
  /** The height of the viewport the sheet covers at its current detent, in px; 0 at peek. */
  onCoveredHeightChange?: (px: number) => void
}

export interface AdvancedDrawerItem {
  id: string
  title: string
  subtitle: string
  icon: unknown
  onTrigger: () => void
}
