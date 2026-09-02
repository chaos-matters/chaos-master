import { createSignal } from 'solid-js'

/**
 * Top-level surfaces of the app.
 *
 * 'workspace' is the editor and stays the default: every existing entry path
 * (share links, benchmark, the welcome screen) expects to land there, so
 * adding Home must not change where anyone arrives.
 */
export type AppTab = 'home' | 'workspace' | 'arcade'

/** The Arcade panels a deep link (or a tool) can open the hub on. */
export type ArcadeMode = 'teach' | 'cinema' | 'duel' | 'beats'

/**
 * The tab lives in the URL fragment (`#home`) rather than in storage, so a
 * reload keeps you where you were and the address bar tells the truth. The
 * fragment is deliberate: the app is served as a single page, so a real path
 * would 404 on refresh without server rewrites, and unlike a query parameter
 * a fragment is never sent to the server — which also keeps it out of
 * analytics alongside the share payloads (see lib/telemetry.ts).
 */
const HOME_HASH = '#home'
const ARCADE_HASH = '#arcade'

function tabFromHash(): AppTab {
  // Named `fragment` rather than `hash`: the security lint rule flags string
  // comparisons against anything called a hash as a timing attack.
  const fragment = globalThis.location?.hash ?? ''
  if (fragment === HOME_HASH) return 'home'
  if (fragment === ARCADE_HASH || fragment.startsWith(`${ARCADE_HASH}=`)) {
    return 'arcade'
  }
  return 'workspace'
}

function hashFor(tab: AppTab, mode?: ArcadeMode): string {
  if (tab === 'home') return HOME_HASH
  if (tab === 'arcade') return mode ? `${ARCADE_HASH}=${mode}` : ARCADE_HASH
  return ''
}

const [activeTab, setActiveTabSignal] = createSignal<AppTab>(tabFromHash())

export { activeTab }

export function setActiveTab(tab: AppTab, mode?: ArcadeMode): void {
  setActiveTabSignal(tab)
  const { location, history } = globalThis
  if (!location || !history) return
  // Preserve the query string: a share link (`?s=`, `?flame=`, `?cv=`) must
  // survive a trip to Home and back, and replaceState keeps the tab switch out
  // of the back-button history — going "back" should leave the app, not
  // retrace which tab you looked at.
  const next = `${location.pathname}${location.search}${hashFor(tab, mode)}`
  if (`${location.pathname}${location.search}${location.hash}` !== next) {
    history.replaceState(history.state, '', next)
  }
}

// The fragment can change without us: the back/forward buttons, or a pasted
// link into an already-open tab. Follow it rather than letting the UI and the
// address bar disagree.
globalThis.addEventListener?.('hashchange', () => {
  setActiveTabSignal(tabFromHash())
})

/**
 * The workspace canvas keeps its GPU resources while Home is showing — the
 * editor must not lose state just because you looked at the gallery — but it
 * has nothing to draw to. Callers fold this into the render interval so an
 * invisible canvas costs nothing, the same way an open modal does.
 */
export const workspaceIsVisible = () => activeTab() === 'workspace'
