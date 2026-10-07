import { Create, GridIcon } from '@/icons'
import { activeTab, setActiveTab } from '@/lib/activeTab'
import { haptic } from '@/lib/haptics'
import type { Component } from 'solid-js'

/** Play is designed but not shown in this phase (DESIGN.md, section 12). */
export type ShellDestination = 'create' | 'library'

/**
 * The destinations, once. Both shells render this list, so adding Play later
 * is one entry rather than one entry per surface.
 */
export const DESTINATIONS: readonly {
  readonly id: ShellDestination
  readonly label: string
  readonly Icon: Component<{ class?: string }>
}[] = [
  { id: 'create', label: 'Create', Icon: Create },
  { id: 'library', label: 'Library', Icon: GridIcon },
]

/**
 * Which destination the app is on. Library is the existing Home tab and
 * Create is the editor (the cut list in DESIGN.md section 12 kept Library
 * from becoming a tab of its own), and that mapping was written out at three
 * call sites before this.
 */
export const shellDestination = (): ShellDestination =>
  activeTab() === 'home' ? 'library' : 'create'

/** The same mapping the other way. */
export function goToDestination(destination: ShellDestination): void {
  setActiveTab(destination === 'library' ? 'home' : 'workspace')
}

/**
 * motion.md 2.5: one selection tick per destination change, and never on a
 * re-tap of the one you are already on.
 */
export function tickForDestination(
  next: ShellDestination,
  current: ShellDestination,
): void {
  if (next !== current) haptic.selectionChanged()
}
