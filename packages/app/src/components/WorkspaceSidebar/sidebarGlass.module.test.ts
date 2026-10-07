/**
 * The stylesheet side of the glass desktop sidebar (useSidebarGlass.ts),
 * held to what the code assumes. The test DOM applies no CSS, so this reads
 * the stylesheets:
 *
 *   - the setting-off canvas runs CANVAS_TUCK_REM under the sidebar, which
 *     the cover the sidebar writes leaves out;
 *   - while the sidebar floats (.underSidebar on the canvas box), the box
 *     spans the sidebar's column without the tuck, at the desktop widths
 *     only, and the bottom bar starts where the cover ends;
 *   - the surface is glass by one composes line, the gate's optionalPanel
 *     beside onGlass, which gives the cards and the shared controls their
 *     glass look (glassHooks.test.ts), and App.module.css writes no copy of
 *     the gate;
 *   - the sidebar's own captions read a hook with their opaque look as the
 *     fallback, and the glass sidebar sets exactly that hook, to ink-2
 *     (decision c);
 *   - the hover badge centres between both covers, and nothing inside the
 *     sidebar blurs again.
 *
 * Read from disk rather than imported: the test runtime turns a CSS module
 * import into class names. So it is registered in scripts/always-on-tests.mjs.
 */
import { describe, expect, it } from 'vitest'
import { blockOf, hookReads, ownDeclarations, readCss } from '@/test/cssModule'
import { CANVAS_TUCK_REM, SIDEBAR_DRAWER_QUERY } from './useSidebarGlass'

const app = readCss('App.module.css')

const sidebarGlass = ownDeclarations(blockOf(app, /^\.sidebarGlass\s*\{/m))

describe('the canvas box beside the glass sidebar', () => {
  it('drops the same tuck the cover leaves out', () => {
    const box = blockOf(app, /^\.canvas-container\s*\{/m)
    const tucked = ownDeclarations(blockOf(box, /&:not\(\.fullscreen\)\s*\{/))
    expect(tucked.get('margin-left')).toBe(`-${CANVAS_TUCK_REM}rem`)
  })

  it('spans the sidebar column while the sidebar floats, at desktop widths', () => {
    // Exactly where the sidebar is not a drawer: the complement of the query
    // MainWorkspace reads, so no fractional width between 768 and 769 px
    // (a zoomed desktop) floats the sidebar without the box spanning it.
    const desktop = blockOf(app, `@media not all and ${SIDEBAR_DRAWER_QUERY} {`)
    expect(desktop).toMatch(/^\s*\.canvas-container\.underSidebar/)
    const spans = ownDeclarations(
      blockOf(
        desktop,
        /\.canvas-container\.underSidebar:not\(\.fullscreen\)\s*\{/,
      ),
    )
    expect(spans.get('grid-column-start')).toBe('sidebar')
    expect(spans.get('margin-left')).toBe('0')
    const bar = ownDeclarations(
      blockOf(desktop, /\.underSidebar > \.bottom-bar\s*\{/),
    )
    expect(bar.get('left')).toBe('var(--leading-cover, 0px)')
    // Nowhere else: a span outside the media query would reach the mobile
    // grid, which has no sidebar column.
    expect(app.match(/\.underSidebar/g)).toHaveLength(3)
  })

  it('draws an export that sizes the canvas in the part on show', () => {
    // Render in background off: the frame has the aspect of the part the
    // sidebar leaves (visibleCanvasAspect), not of the box spanning its
    // column, so across the whole box it showed stretched and off centre.
    // The canvas takes that part only while it runs, where the setting-off
    // canvas is, and keeps the inline 100% width it is given as its basis.
    const desktop = blockOf(app, `@media not all and ${SIDEBAR_DRAWER_QUERY} {`)
    const frame = ownDeclarations(
      blockOf(desktop, /\.underSidebar\.exporting > \.canvas\s*\{/),
    )
    expect(frame.get('margin-left')).toBe('var(--leading-cover, 0px)')
    expect(frame.get('max-width')).toBe(
      'calc(100% - var(--leading-cover, 0px))',
    )
  })

  it('centres the hover badge on the part both covers leave', () => {
    const badge = ownDeclarations(blockOf(app, /^\.hover-preview-badge\s*\{/m))
    expect(badge.get('left')).toBe('calc((1 - var(--covered-right, 0)) * 50%)')
    expect(badge.get('margin-left')).toBe('calc(var(--covered-left, 0) * 50%)')
    expect(badge.get('transform')).toBe('translateX(-50%)')
  })
})

describe('the glass sidebar surface', () => {
  it('is glass by one composes line, the gate its own', () => {
    expect(sidebarGlass.get('composes')).toBe(
      "optionalPanel onGlass from '@/styles/designSystem/glass.module.css'",
    )
    // The tablet layout's span is the only rule here that reads the setting;
    // the sidebar leaves the gate to glass.module.css.
    expect(app.match(/data-glass-panels/g)).toHaveLength(1)
    expect(sidebarGlass.get('background')).toBeUndefined()
    expect(sidebarGlass.get('backdrop-filter')).toBeUndefined()
  })

  it('keeps one blurred layer', () => {
    const inside = ownDeclarations(
      blockOf(app, /^\.sidebar\.sidebarGlass \*\s*\{/m),
    )
    expect(inside.get('-webkit-backdrop-filter')).toBe('none')
    expect(inside.get('backdrop-filter')).toBe('none')
  })

  it('fades its fill as busy turns it solid, and keeps easing its transform', () => {
    // optionalPanel sets no transition, and the sidebar's own eases its
    // transform only: without background-color there the fill snaps between
    // the glass and the solid fill whenever playback starts or stops.
    expect(sidebarGlass.get('transition')).toBe(
      'transform 200ms ease, background-color var(--la-dur-fast) var(--la-ease)',
    )
    const sidebar = ownDeclarations(blockOf(app, /^\.sidebar\s*\{/m))
    expect(sidebar.get('transition')).toBe('transform 200ms ease')
  })

  it("sets exactly the hook the sidebar's own captions read", () => {
    const reads = hookReads(app, ['caption'])
    expect(reads.length).toBeGreaterThan(0)
    // Every read falls back to the look it had, for everywhere but here.
    expect(reads.filter((r) => !r.fallback)).toEqual([])
    const set = [...sidebarGlass.keys()].filter((name) =>
      name.startsWith('--caption-'),
    )
    expect(new Set(set)).toEqual(new Set(reads.map((r) => r.name)))
    for (const name of set) {
      expect(sidebarGlass.get(name), name).toBe('var(--la-ink-2)')
    }
  })
})
