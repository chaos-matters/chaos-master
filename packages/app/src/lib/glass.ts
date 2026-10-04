/**
 * The switches that styles/designSystem/glass.module.css reads from <html>.
 * The stylesheet says what each one does; this module is the only thing that
 * writes them, so none can be left on by a surface that forgot to clear it.
 */
import { createSignal } from 'solid-js'
import { persistentSignal } from '@/utils/persistentSignal'
import type { Accessor } from 'solid-js'
import type { Theme } from '@/contexts/ThemeContext'

const [glassPanels, storeGlassPanels] = persistentSignal<boolean>(
  'chaos-glass-panels',
  true,
)

/**
 * The Glass panels setting, on by default: the large panels that float over
 * the canvas as real glass, where blur costs the most
 * (docs/plans/glass-panels.md). Offered in Settings on every layout, for
 * whoever would rather have the frame rate. Stored like the touch layout
 * preference, and only once someone changes it, so the default can move.
 * Only its toggle in Settings (HelpModal/GlassPanelsSetting.tsx) reads it
 * here, and glassAllowed beside it for its hint; everything else asks
 * glassAllowed, below.
 */
export { glassPanels }

/** A media query as a signal; false where there is no matchMedia. */
function mediaQuery(query: string): Accessor<boolean> {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return () => false
  const list = window.matchMedia(query)
  const [matches, setMatches] = createSignal(list.matches)
  list.addEventListener?.('change', (event) => {
    setMatches(event.matches)
    writeGlassPanels()
  })
  return matches
}

const reducedTransparency = mediaQuery('(prefers-reduced-transparency: reduce)')
const moreContrast = mediaQuery('(prefers-contrast: more)')

/**
 * Whether the glass panels show at all: the setting is on, and neither Reduce
 * Transparency nor More Contrast is asked for. Under either, lumen.css turns
 * every glass fill solid, so a panel floating over the canvas would hide the
 * canvas it costs, and each one keeps its place beside the canvas instead.
 * The data-glass-panels attribute says the same to the stylesheets. The rail's
 * sheet (TouchSurface/EditorRail.tsx) and the tablet deck
 * (TouchSurface/TabletInspectorDeck.tsx) read it, and optionalPanelGlass below.
 */
export function glassAllowed(): boolean {
  return glassPanels() && !reducedTransparency() && !moreContrast()
}

export function setGlassPanels(on: boolean): void {
  storeGlassPanels(on)
  writeGlassPanels()
}

/**
 * Whether an optionalPanel is glass in `theme`: glass is allowed and the
 * theme is not light. The same test, in code, as the gate in front of
 * glass.module.css's optionalPanel, for what a stylesheet cannot decide on its
 * own, such as the desktop sidebar floating over the canvas and how much of
 * the canvas the camera frames the flame beside
 * (WorkspaceSidebar/useSidebarGlass.ts). optionalPanelGlass.test.ts matches
 * the gate's own selector against this for every setting and theme, so the
 * two cannot disagree.
 */
export function optionalPanelGlass(theme: Theme): boolean {
  return glassAllowed() && theme !== 'light'
}

/** Puts glassAllowed on <html>; index.tsx calls it before the first render. */
export function applyGlassPanels(): void {
  writeGlassPanels()
}

function writeGlassPanels(): void {
  const root = document.documentElement
  if (glassAllowed()) root.dataset.glassPanels = 'on'
  else delete root.dataset.glassPanels
}

/**
 * data-glass="busy": the editor canvas presents every frame, so the large
 * panels go solid. hooks/useWorkspaceGlassBusy.ts decides when, and is the
 * only caller.
 */
export function writeGlassBusy(busy: boolean): void {
  const root = document.documentElement
  if (busy) root.dataset.glass = 'busy'
  else delete root.dataset.glass
}
