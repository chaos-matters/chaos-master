/**
 * The desktop sidebar as glass over the canvas (docs/plans/glass-panels.md,
 * decision d), decided in one place.
 *
 * While the Glass panels setting applies - on, and the theme not light, the
 * gate in front of glass.module.css's optionalPanel, which
 * optionalPanelGlass in lib/glass.ts mirrors - the sidebar floats over the
 * canvas instead of beside it, as the tablet deck does at the other edge. The
 * canvas box spans the sidebar's column too and the art runs on under the
 * glass (App.module.css, .underSidebar), and the camera frames the flame in
 * the part the sidebar leaves visible (lib/canvasFraming.ts). Not at the
 * mobile widths, where the sidebar is a drawer over the canvas that a tap on
 * the canvas closes, not a column beside it.
 *
 *   floats  the sidebar is over the canvas. It writes the leading cover, by
 *           which the canvas box spans the column and the camera frames the
 *           flame, and writes 0 once it is not: hidden, unmounted, the
 *           setting off, the light theme or a mobile width.
 *   glass   the sidebar's own surface is glass (App.module.css,
 *           .sidebarGlass): whenever it floats, except over a duel, whose
 *           stage it sits on as the opaque editor it has always been there.
 *           The canvas under a duel's stage is not on show either way.
 *
 * The cover is the sidebar's width less the 0.4rem the setting-off canvas
 * already runs under it (CANVAS_TUCK_REM), so the part on show is the
 * setting-off canvas's box to the pixel: the flame sits where it sits with the
 * setting off, and an image taken off the canvas is the one the setting-off
 * canvas gives, the same size included. It is measured rather than taken from
 * the compact or wide width, since the sidebar is fluid below 1200 px, and it
 * follows the sidebar as it resizes, once each resize settles.
 */
import { createEffect, createMemo, onCleanup } from 'solid-js'
import { useTheme } from '@/contexts/ThemeContext'
import { CANVAS_RESIZE_DEBOUNCE_MS } from '@/defaults'
import { setLeadingCover } from '@/lib/canvasFraming'
import { optionalPanelGlass } from '@/lib/glass'
import type { Accessor } from 'solid-js'

/**
 * How far the canvas runs under the sidebar with the setting off, for the
 * fade at its rim (App.module.css, `.canvas-container`'s margin-left).
 * sidebarGlass.module.test.ts holds the two equal.
 */
export const CANVAS_TUCK_REM = 0.4

/**
 * The widths at which the sidebar is a drawer over the canvas rather than a
 * column beside it (MainWorkspace's isMobile). The canvas box spans the
 * column under exactly its complement, `not all and` this query
 * (App.module.css, .underSidebar), so the two never disagree, at a
 * fractional width included. sidebarGlass.module.test.ts holds them so.
 */
export const SIDEBAR_DRAWER_QUERY = '(max-width: 768px)'

export interface SidebarGlassOptions {
  /** The sidebar's root element, while it is mounted. */
  element: Accessor<HTMLElement | undefined>
  /** The sidebar is shown, rather than hidden for a full-screen canvas. */
  shown: Accessor<boolean>
  /** A mobile width (SIDEBAR_DRAWER_QUERY), where the sidebar is a drawer. */
  isMobile: Accessor<boolean>
  /** The sidebar sits over a duel's stage. */
  overDuel: Accessor<boolean>
}

export interface SidebarGlass {
  floats: Accessor<boolean>
  glass: Accessor<boolean>
}

/** CSS px of the canvas the sidebar `element` hides beyond the setting-off tuck. */
export function sidebarCover(element: HTMLElement): number {
  const rootFontPx =
    Number.parseFloat(
      window.getComputedStyle(document.documentElement).fontSize,
    ) || 16
  return Math.max(
    0,
    element.getBoundingClientRect().width - CANVAS_TUCK_REM * rootFontPx,
  )
}

export function useSidebarGlass(options: SidebarGlassOptions): SidebarGlass {
  const { theme } = useTheme()
  const floats = createMemo(
    () => options.shown() && !options.isMobile() && optionalPanelGlass(theme()),
  )
  const glass = createMemo(() => floats() && !options.overDuel())

  // Measured at once when the sidebar starts floating, so the canvas box
  // spans the column in the same frame, and again whenever it resizes: the
  // compact and wide widths, and the fluid width below 1200 px. A resize
  // waits for CANVAS_RESIZE_DEBOUNCE_MS of quiet, as the canvas's own size
  // does (utils/useElementSize.ts): dragging the window's edge resizes the
  // fluid sidebar every frame, and each new cover would shift the camera
  // and restart the flame's accumulation, so the cover lands once, with the
  // canvas's width. Docking clears a resize still waiting.
  createEffect(() => {
    const element = options.element()
    if (!floats() || !element) {
      setLeadingCover(0)
      return
    }
    setLeadingCover(sidebarCover(element))
    let settle: number | undefined
    const observer = new ResizeObserver(() => {
      window.clearTimeout(settle)
      settle = window.setTimeout(() => {
        setLeadingCover(sidebarCover(element))
      }, CANVAS_RESIZE_DEBOUNCE_MS)
    })
    observer.observe(element, { box: 'border-box' })
    onCleanup(() => {
      window.clearTimeout(settle)
      observer.disconnect()
    })
  })
  onCleanup(() => {
    setLeadingCover(0)
  })

  return { floats, glass }
}
