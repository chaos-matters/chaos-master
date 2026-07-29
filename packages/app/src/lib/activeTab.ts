import { persistentSignal } from '@/utils/persistentSignal'

/**
 * Top-level surfaces of the app.
 *
 * 'workspace' is the editor and stays the default: every existing entry path
 * (share links, benchmark, the welcome screen) expects to land there, so
 * adding Home must not change where anyone arrives.
 */
export type AppTab = 'home' | 'workspace'

export const [activeTab, setActiveTab] = persistentSignal<AppTab>(
  'active-tab',
  'workspace',
)

/**
 * The workspace canvas keeps its GPU resources while Home is showing — the
 * editor must not lose state just because you looked at the gallery — but it
 * has nothing to draw to. Callers fold this into the render interval so an
 * invisible canvas costs nothing, the same way an open modal does.
 */
export const workspaceIsVisible = () => activeTab() === 'workspace'
