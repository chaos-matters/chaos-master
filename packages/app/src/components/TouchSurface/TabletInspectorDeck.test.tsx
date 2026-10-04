/**
 * The tablet inspector deck's two modes. With the Glass panels setting off it
 * is today's page beside the canvas; with it on it floats over the canvas as
 * glass and tells the canvas how much of it the deck covers, so the camera
 * can frame the flame beside it (lib/canvasFraming.ts). The rest of the deck's
 * behaviour is in TouchSurface.test.tsx.
 */
import '@/commands/builtins'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deckResizing, trailingCover } from '@/lib/canvasFraming'
import { setGlassPanels } from '@/lib/glass'
import { safeRemoveItem } from '@/utils/storage'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { TabletInspectorDeck } from './TabletInspectorDeck'

// The setting as a plain signal: the real one lives in localStorage and on
// <html>, neither of which this runtime keeps between tests. With no system
// preference asking for solid surfaces, glass is allowed exactly when the
// setting is on.
vi.mock('@/lib/glass', async () => {
  const { createSignal } = await import('solid-js')
  const [glassPanels, setGlassPanels] = createSignal(false)
  return { glassPanels, glassAllowed: glassPanels, setGlassPanels }
})

const deck = () =>
  screen.getByRole('complementary', { name: 'Tablet Touch Inspector' })

function mountDeck() {
  const ctx = createMockCommandContext()
  const view = render(() => (
    <TabletInspectorDeck
      ctx={ctx}
      flame={ctx.flameDescriptor}
      onSnapshot={() => {}}
    />
  ))
  return { ctx, view }
}

describe('TabletInspectorDeck, with the Glass panels setting', () => {
  beforeEach(() => {
    // A landscape 11 inch iPad, and no width carried over from another test.
    window.innerWidth = 1210
    window.innerHeight = 834
    safeRemoveItem('chaos-master-chaos-tablet-deck-width')
    setGlassPanels(false)
  })

  afterEach(cleanup)

  it('off, is the opaque page it has always been, covering nothing', () => {
    mountDeck()

    const classes = [...deck().classList]
    expect(classes).toContain('deck')
    expect(classes).toContain('page')
    expect(classes).not.toContain('floating')
    // The glass primitive's panel class (glass.module.css).
    expect(classes).not.toContain('panel')
    expect(trailingCover()).toBe(0)
  })

  it('on, floats over the canvas as glass and covers its own width', () => {
    setGlassPanels(true)
    mountDeck()

    const classes = [...deck().classList]
    expect(classes).toContain('deck')
    expect(classes).toContain('floating')
    expect(classes).toContain('panel')
    expect(classes).not.toContain('page')
    expect(deck().style.width).toBe('380px')
    expect(trailingCover()).toBe(380)
  })

  it('follows the setting both ways without a remount', () => {
    mountDeck()
    expect(trailingCover()).toBe(0)

    setGlassPanels(true)
    expect(deck().classList.contains('floating')).toBe(true)
    expect(trailingCover()).toBe(380)

    setGlassPanels(false)
    expect(deck().classList.contains('page')).toBe(true)
    expect(deck().classList.contains('panel')).toBe(false)
    expect(trailingCover()).toBe(0)
  })

  it('covers what the divider makes it, as the finger moves', () => {
    setGlassPanels(true)
    mountDeck()

    const divider = screen.getByTestId('deck-divider')
    fireEvent.pointerDown(divider, { clientX: 900, pointerId: 1 })
    fireEvent.pointerMove(divider, { clientX: 880, pointerId: 1 })
    expect(trailingCover()).toBe(400)
    fireEvent.pointerMove(divider, { clientX: 860, pointerId: 1 })
    expect(trailingCover()).toBe(420)
    fireEvent.pointerUp(divider, { clientX: 860, pointerId: 1 })
    expect(trailingCover()).toBe(420)
  })

  it.each([true, false])(
    'says it is resizing the canvas only while the divider moves (glass %s)',
    (on) => {
      // Floating, the drag reframes the canvas under the deck; as a page, it
      // resizes the canvas beside it. Either way the canvas presents every
      // frame, which the glass busy switch reads (useWorkspaceGlassBusy.ts).
      // A press that does not move, half of the double tap that collapses
      // the deck, resizes nothing.
      setGlassPanels(on)
      mountDeck()

      const divider = screen.getByTestId('deck-divider')
      fireEvent.pointerDown(divider, { clientX: 900, pointerId: 1 })
      expect(deckResizing()).toBe(false)
      fireEvent.pointerMove(divider, { clientX: 880, pointerId: 1 })
      expect(deckResizing()).toBe(true)
      fireEvent.pointerUp(divider, { clientX: 880, pointerId: 1 })
      expect(deckResizing()).toBe(false)
    },
  )

  it('stops resizing when it unmounts mid-drag', () => {
    // The drag ends with the deck (createDragHandler reports it when the deck
    // unmounts), so nothing is left saying the canvas resizes.
    setGlassPanels(true)
    const { view } = mountDeck()

    const divider = screen.getByTestId('deck-divider')
    fireEvent.pointerDown(divider, { clientX: 900, pointerId: 1 })
    fireEvent.pointerMove(divider, { clientX: 880, pointerId: 1 })
    expect(deckResizing()).toBe(true)

    view.unmount()
    expect(deckResizing()).toBe(false)
  })

  it('collapsed, covers nothing, and the edge tab brings it back', () => {
    setGlassPanels(true)
    mountDeck()

    fireEvent.dblClick(screen.getByTestId('deck-divider'))
    expect(trailingCover()).toBe(0)

    screen.getByRole('button', { name: 'Show inspector' }).click()
    expect(deck().classList.contains('floating')).toBe(true)
    expect(trailingCover()).toBe(380)
  })

  it('uncovers the canvas when it unmounts', () => {
    // A rotation below the deck threshold swaps it for the rail.
    setGlassPanels(true)
    const { view } = mountDeck()
    expect(trailingCover()).toBe(380)

    view.unmount()
    expect(trailingCover()).toBe(0)
  })

  it('moves the view and never the flame', () => {
    // The framing is view-only. Floating, resizing, collapsing and reopening
    // the deck run no command and write neither the document nor its camera.
    setGlassPanels(true)
    const { ctx } = mountDeck()
    const before = JSON.stringify(ctx.flameDescriptor())

    const divider = screen.getByTestId('deck-divider')
    fireEvent.pointerDown(divider, { clientX: 900, pointerId: 1 })
    fireEvent.pointerMove(divider, { clientX: 840, pointerId: 1 })
    fireEvent.pointerUp(divider, { clientX: 840, pointerId: 1 })
    fireEvent.dblClick(divider)
    screen.getByRole('button', { name: 'Show inspector' }).click()
    setGlassPanels(false)

    expect(ctx.beforeCommand).not.toHaveBeenCalled()
    expect(ctx.setFlameDescriptor).not.toHaveBeenCalled()
    expect(ctx.setPosition).not.toHaveBeenCalled()
    expect(ctx.setZoom).not.toHaveBeenCalled()
    expect(JSON.stringify(ctx.flameDescriptor())).toBe(before)
  })
})
