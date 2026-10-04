import '@/commands/builtins'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi, } from 'vitest'
import { setActiveTab } from '@/lib/activeTab'
import { backDepth, popBack } from '@/lib/backStack'
import { safeRemoveItem } from '@/utils/storage'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { AdvancedToolsDrawer, TabletInspectorDeck, TouchControlSurface, TouchHUD, } from './index'
import type { TouchControlSurfaceProps } from './types'
import type { TransformId, VariationId } from '@/flame/schema/flameSchema'
import type * as StorageUtils from '@/utils/storage'

// Every persisted signal writes through this, so a test can count the writes
// a gesture costs. localStorage itself is not usable in this runtime.
const storageWrite = vi.fn()
vi.mock('@/utils/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof StorageUtils>()
  return {
    ...actual,
    safeSetItem: (key: string, value: string) => {
      storageWrite(key, value)
      return actual.safeSetItem(key, value)
    },
  }
})

describe('TouchSurface Components', () => {
  afterEach(cleanup)

  describe('TouchHUD', () => {
    it('renders the flame name, Library and the history buttons', () => {
      const ctx = createMockCommandContext()
      const onPickGallery = vi.fn()
      const onUndo = vi.fn()
      const onRedo = vi.fn()

      render(() => (
        <TouchHUD
          ctx={ctx}
          flame={ctx.flameDescriptor}
          onPickGallery={onPickGallery}
          onUndo={onUndo}
          onRedo={onRedo}
          canUndo={() => true}
          canRedo={() => false}
        />
      ))

      expect(screen.getByRole('banner')).toBeTruthy()

      const library = screen.getByRole('button', { name: 'Library' })
      library.click()
      expect(onPickGallery).toHaveBeenCalled()

      // The title button keeps its tap tooltip.
      const titleBtn = screen.getByTitle(
        ctx.flameDescriptor().metadata?.name || 'Untitled flame',
      )
      titleBtn.click()
      expect(screen.getByRole('tooltip')).toBeTruthy()

      // Undo and Redo draw their disabled state instead of disappearing.
      const undo = screen.getByRole('button', { name: 'Undo' })
      const redo = screen.getByRole('button', { name: 'Redo' })
      expect((redo as HTMLButtonElement).disabled).toBe(true)
      expect((undo as HTMLButtonElement).disabled).toBe(false)
      undo.click()
      redo.click()
      expect(onUndo).toHaveBeenCalledTimes(1)
      expect(onRedo).not.toHaveBeenCalled()
    })

    it('falls back to Untitled flame when the flame has no name', () => {
      const ctx = createMockCommandContext()
      const flame = () => ({
        ...ctx.flameDescriptor(),
        metadata: { ...ctx.flameDescriptor().metadata, name: '' },
      })

      render(() => <TouchHUD ctx={ctx} flame={flame} />)

      expect(screen.getByTitle('Untitled flame')).toBeTruthy()
    })

    it('lists only the More items whose handler was given', () => {
      const ctx = createMockCommandContext()
      const onOpenExportModal = vi.fn()
      const onOpenSettings = vi.fn()

      render(() => (
        <TouchHUD
          ctx={ctx}
          flame={ctx.flameDescriptor}
          onOpenExportModal={onOpenExportModal}
          onOpenSettings={onOpenSettings}
        />
      ))

      screen.getByRole('button', { name: 'More' }).click()
      expect(screen.getByText('Settings and more')).toBeTruthy()
      expect(screen.queryByText('Share link')).toBeNull()

      screen.getByText('Export options').click()
      expect(onOpenExportModal).toHaveBeenCalled()
      // Choosing an item closes the menu.
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('offers both ways into the benchmarks', () => {
      const ctx = createMockCommandContext()
      const onOpenBenchmark = vi.fn()
      const onOpenBenchmarkLab = vi.fn()

      render(() => (
        <TouchHUD
          ctx={ctx}
          flame={ctx.flameDescriptor}
          onOpenBenchmark={onOpenBenchmark}
          onOpenBenchmarkLab={onOpenBenchmarkLab}
        />
      ))

      // Hiding the floating version menu on this layout took both entry
      // points with it; the More menu is where they live now.
      screen.getByRole('button', { name: 'More' }).click()
      screen.getByText('Quick GPU benchmark').click()
      expect(onOpenBenchmark).toHaveBeenCalledTimes(1)

      screen.getByRole('button', { name: 'More' }).click()
      screen.getByText('Benchmark Lab').click()
      expect(onOpenBenchmarkLab).toHaveBeenCalledTimes(1)
    })

    it('closes its popovers from a tap anywhere on the screen', () => {
      const ctx = createMockCommandContext()
      render(() => (
        <TouchHUD
          ctx={ctx}
          flame={ctx.flameDescriptor}
          onOpenSettings={vi.fn()}
        />
      ))

      screen.getByRole('button', { name: 'More' }).click()
      expect(screen.getByRole('menu')).toBeTruthy()
      const backdrop = screen.getByTestId('hud-popover-backdrop')
      // The pill's blur makes it the containing block for a fixed child, so
      // a backdrop inside it covers the pill and nothing else: the canvas
      // below stayed live and the menu never closed.
      expect(screen.getByRole('banner').contains(backdrop)).toBe(false)
      backdrop.click()
      expect(screen.queryByRole('menu')).toBeNull()

      const titleBtn = screen.getByTitle(
        ctx.flameDescriptor().metadata?.name || 'Untitled flame',
      )
      titleBtn.click()
      expect(screen.getByRole('tooltip')).toBeTruthy()
      screen.getByTestId('hud-popover-backdrop').click()
      expect(screen.queryByRole('tooltip')).toBeNull()
    })

    it('closes its popovers on back', () => {
      const ctx = createMockCommandContext()
      render(() => (
        <TouchHUD
          ctx={ctx}
          flame={ctx.flameDescriptor}
          onOpenSettings={vi.fn()}
        />
      ))

      screen.getByRole('button', { name: 'More' }).click()
      expect(backDepth()).toBe(1)
      expect(popBack()).toBe(true)
      expect(screen.queryByRole('menu')).toBeNull()
      expect(backDepth()).toBe(0)
    })

    it('leaves the tab order while a destination covers it', () => {
      const ctx = createMockCommandContext()
      render(() => (
        <TouchHUD
          ctx={ctx}
          flame={ctx.flameDescriptor}
          onOpenSettings={vi.fn()}
        />
      ))

      const hud = screen.getByRole('banner')
      expect(hud.hasAttribute('inert')).toBe(false)

      setActiveTab('home')
      expect(hud.hasAttribute('inert')).toBe(true)
      // Still mounted, still holding its state: Home covers the editor, it
      // does not unmount it.
      expect(screen.getByRole('button', { name: 'Library' })).toBeTruthy()

      setActiveTab('workspace')
      expect(hud.hasAttribute('inert')).toBe(false)
    })
  })

  describe('AdvancedToolsDrawer', () => {
    it('renders cards and dispatches actions when open', () => {
      const onClose = vi.fn()
      const onArtDirector = vi.fn()
      const onFlameClash = vi.fn()
      const onBreed = vi.fn()
      const onSwitchToDesktop = vi.fn()
      const onPickGallery = vi.fn()

      render(() => (
        <AdvancedToolsDrawer
          open={true}
          onClose={onClose}
          onArtDirector={onArtDirector}
          onFlameClash={onFlameClash}
          onBreed={onBreed}
          onSwitchToDesktop={onSwitchToDesktop}
          onPickGallery={onPickGallery}
        />
      ))

      expect(screen.getByRole('dialog')).toBeTruthy()
      expect(screen.getByText('Browse Flame Gallery')).toBeTruthy()
      expect(screen.getByText('Switch to Desktop Layout')).toBeTruthy()
      expect(screen.getByText('Art Director Mode')).toBeTruthy()
      expect(screen.getByText('Flame Clash Arena')).toBeTruthy()
      expect(screen.getByText('Breeding & Genetics')).toBeTruthy()

      screen.getByText('Browse Flame Gallery').click()
      expect(onPickGallery).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()

      screen.getByText('Switch to Desktop Layout').click()
      expect(onSwitchToDesktop).toHaveBeenCalled()

      screen.getByText('Art Director Mode').click()
      expect(onArtDirector).toHaveBeenCalled()
    })

    it('closes on Escape key press when open', () => {
      const onClose = vi.fn()
      render(() => <AdvancedToolsDrawer open={true} onClose={onClose} />)

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(onClose).toHaveBeenCalled()
    })

    it('does not render when open is false', () => {
      render(() => <AdvancedToolsDrawer open={false} onClose={() => {}} />)

      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  describe('TouchControlSurface', () => {
    // The tablet deck's save button calls its own `onSnapshot`; the surface
    // was handed one too and never read it. Checked by `pnpm typecheck`.
    it('takes no save handler of its own', () => {
      expectTypeOf<TouchControlSurfaceProps>().not.toHaveProperty('onSnapshot')
    })

    it('renders transform pills, tabs, and switches views', () => {
      const ctx = createMockCommandContext()

      render(() => (
        <TouchControlSurface
          ctx={ctx}
          flame={ctx.flameDescriptor}
          mode="tablet-deck"
        />
      ))

      // Check transform pill exists
      expect(screen.getByRole('button', { name: 'T1' })).toBeTruthy()

      // Check tabs exist
      const varTab = screen.getByRole('tab', { name: /Variations/i })
      const shapeTab = screen.getByRole('tab', { name: /Shape/i })
      const colourTab = screen.getByRole('tab', { name: /Colour/i })

      expect(varTab).toBeTruthy()
      expect(shapeTab).toBeTruthy()
      expect(colourTab).toBeTruthy()

      // Switch to Shape tab
      shapeTab.click()
      expect(screen.getByText(/Reset Shape/i)).toBeTruthy()

      // Switch to Colour tab
      colourTab.click()
      expect(screen.getByText(/Color Coordinate/i)).toBeTruthy()
    })

    it('dispatches flame.setVariationWeight when variation slider changes', () => {
      const ctx = createMockCommandContext()

      render(() => (
        <TouchControlSurface
          ctx={ctx}
          flame={ctx.flameDescriptor}
          mode="bottom-sheet"
        />
      ))

      const slider = screen.getByLabelText(/linear weight/i)
      expect(slider).toBeTruthy()

      fireEvent.input(slider, { target: { value: '0.85' } })
      expect(ctx.setFlameDescriptor).toHaveBeenCalled()
      const t1 = ctx.flameDescriptor().transforms['t1' as TransformId]
      expect(t1?.variations['v1' as VariationId]?.weight).toBe(0.85)
    })
  })

  describe('TabletInspectorDeck', () => {
    beforeEach(() => {
      // A landscape 11 inch iPad, and no width carried over from a sibling
      // test. safeRemoveItem, because this runtime's localStorage is partial.
      window.innerWidth = 1210
      window.innerHeight = 834
      safeRemoveItem('chaos-master-chaos-tablet-deck-width')
    })

    const deck = () =>
      screen.getByRole('complementary', { name: 'Tablet Touch Inspector' })

    it('renders the header, the segmented row and the control surface', () => {
      const ctx = createMockCommandContext()
      const onPickGallery = vi.fn()

      render(() => (
        <TabletInspectorDeck
          ctx={ctx}
          flame={ctx.flameDescriptor}
          onSnapshot={() => {}}
          onPickGallery={onPickGallery}
        />
      ))

      expect(deck()).toBeTruthy()
      screen.getByRole('button', { name: 'Library' }).click()
      expect(onPickGallery).toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Redo' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Save image' })).toBeTruthy()
      expect(
        screen.getAllByRole('tab').map((t) => t.textContent?.trim()),
      ).toEqual(['Variations', 'Shape', 'Colour'])
      expect(screen.getByRole('button', { name: 'T1' })).toBeTruthy()
    })

    it('collapses to an edge tab on a double tap and reopens', () => {
      const ctx = createMockCommandContext()
      render(() => (
        <TabletInspectorDeck
          ctx={ctx}
          flame={ctx.flameDescriptor}
          onSnapshot={() => {}}
        />
      ))

      fireEvent.dblClick(screen.getByTestId('deck-divider'))
      expect(
        screen.queryByRole('complementary', { name: 'Tablet Touch Inspector' }),
      ).toBeNull()

      screen.getByRole('button', { name: 'Show inspector' }).click()
      expect(deck()).toBeTruthy()
    })

    it('leaves the tab order while a destination covers it', () => {
      const ctx = createMockCommandContext()
      render(() => (
        <TabletInspectorDeck
          ctx={ctx}
          flame={ctx.flameDescriptor}
          onSnapshot={() => {}}
        />
      ))

      expect(deck().hasAttribute('inert')).toBe(false)

      // The deck layout is where this matters most: the rail the phone marks
      // inert is not even mounted here, and the deck is expanded under Home
      // with its header, its tab chips and every variation tile still in the
      // tab order - 64 of 70 focusable controls behind the overlay.
      setActiveTab('home')
      expect(deck().hasAttribute('inert')).toBe(true)
      // Out of reach, not gone: the deck keeps its width and its state.
      expect(deck().style.width).toBe('380px')

      // Collapsed - which is done from the editor, never from under Home -
      // the edge tab is all that is left of the deck, and it goes behind the
      // overlay just the same.
      setActiveTab('workspace')
      fireEvent.dblClick(screen.getByTestId('deck-divider'))
      const edgeTab = () =>
        screen.getByRole('button', { name: 'Show inspector' })
      expect(edgeTab().hasAttribute('inert')).toBe(false)

      setActiveTab('home')
      expect(edgeTab().hasAttribute('inert')).toBe(true)

      setActiveTab('workspace')
      expect(edgeTab().hasAttribute('inert')).toBe(false)
    })

    it('saves on a tap and opens the export options on a long press', () => {
      vi.useFakeTimers()
      const ctx = createMockCommandContext()
      const onSnapshot = vi.fn()
      const onOpenExportOptions = vi.fn()
      render(() => (
        <TabletInspectorDeck
          ctx={ctx}
          flame={ctx.flameDescriptor}
          onSnapshot={onSnapshot}
          onOpenExportOptions={onOpenExportOptions}
        />
      ))

      const save = screen.getByRole('button', { name: 'Save image' })
      fireEvent.pointerDown(save)
      fireEvent.pointerUp(save)
      fireEvent.click(save)
      expect(onSnapshot).toHaveBeenCalledTimes(1)

      fireEvent.pointerDown(save)
      vi.advanceTimersByTime(600)
      fireEvent.pointerUp(save)
      fireEvent.click(save)
      expect(onOpenExportOptions).toHaveBeenCalledTimes(1)
      expect(onSnapshot).toHaveBeenCalledTimes(1)
      vi.useRealTimers()
    })

    it('resizes by dragging the divider', () => {
      const ctx = createMockCommandContext()
      render(() => (
        <TabletInspectorDeck
          ctx={ctx}
          flame={ctx.flameDescriptor}
          onSnapshot={() => {}}
        />
      ))

      const divider = screen.getByTestId('deck-divider')
      expect(deck().style.width).toBe('380px')
      fireEvent.pointerDown(divider, { clientX: 900, pointerId: 1 })
      fireEvent.pointerMove(divider, { clientX: 860, pointerId: 1 })
      fireEvent.pointerUp(divider, { clientX: 860, pointerId: 1 })
      expect(deck().style.width).toBe('420px')
    })

    it('stores the width once the divider is let go', () => {
      const ctx = createMockCommandContext()
      render(() => (
        <TabletInspectorDeck
          ctx={ctx}
          flame={ctx.flameDescriptor}
          onSnapshot={() => {}}
        />
      ))

      const divider = screen.getByTestId('deck-divider')
      fireEvent.pointerDown(divider, { clientX: 900, pointerId: 1 })
      storageWrite.mockClear()
      fireEvent.pointerMove(divider, { clientX: 880, pointerId: 1 })
      fireEvent.pointerMove(divider, { clientX: 860, pointerId: 1 })
      // The deck follows the finger; a JSON serialise and a synchronous
      // storage write per pointermove do not go with it.
      expect(deck().style.width).toBe('420px')
      expect(storageWrite).not.toHaveBeenCalled()

      fireEvent.pointerUp(divider, { clientX: 860, pointerId: 1 })
      expect(storageWrite).toHaveBeenCalledTimes(1)
      expect(storageWrite).toHaveBeenCalledWith(
        'chaos-master-chaos-tablet-deck-width',
        '420',
      )
    })
  })
})
