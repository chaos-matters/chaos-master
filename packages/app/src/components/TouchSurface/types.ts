import type { Accessor, JSXElement } from 'solid-js'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export type TouchTab = 'variations' | 'shape' | 'colour'

export type TouchSurfaceMode = 'bottom-sheet' | 'tablet-deck'

export interface TouchControlSurfaceProps {
  ctx: CommandContext
  flame: Accessor<FlameDescriptor>
  mode: TouchSurfaceMode
  initialTab?: TouchTab
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

export interface MobileBottomSurfaceProps {
  ctx: CommandContext
  flame: Accessor<FlameDescriptor>
  initialTab?: TouchTab
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

export interface TabletSplitLayoutProps {
  ctx: CommandContext
  flame: Accessor<FlameDescriptor>
  children: JSXElement
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

export interface AdvancedDrawerItem {
  id: string
  title: string
  subtitle: string
  icon: unknown
  onTrigger: () => void
}
