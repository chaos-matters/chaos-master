import '@/commands/builtins'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { AdvancedToolsDrawer, MobileBottomSurface, TabletInspectorDeck, TabletSplitLayout, TouchControlSurface, TouchHUD, } from './index'
import type { TransformId, VariationId } from '@/flame/schema/flameSchema'

describe('TouchSurface Components', () => {
  afterEach(cleanup)

  describe('TouchHUD', () => {
    it('renders flame name and action buttons', () => {
      const ctx = createMockCommandContext()
      const onMutate = vi.fn()
      const onRandomize = vi.fn()
      const onSnapshot = vi.fn()
      const onPickGallery = vi.fn()

      render(() => (
        <TouchHUD
          ctx={ctx}
          flame={ctx.flameDescriptor}
          onMutate={onMutate}
          onRandomize={onRandomize}
          onSnapshot={onSnapshot}
          onPickGallery={onPickGallery}
        />
      ))

      expect(screen.getByRole('banner')).toBeTruthy()

      // Home button opens gallery
      const homeBtn = screen.getByTitle('Browse & load flames from gallery')
      expect(homeBtn).toBeTruthy()
      homeBtn.click()
      expect(onPickGallery).toHaveBeenCalled()

      // Title button toggles tooltip
      const titleBtn = screen.getByTitle(
        ctx.flameDescriptor().metadata?.name || 'Chaos Master',
      )
      expect(titleBtn).toBeTruthy()
      titleBtn.click()
      expect(screen.getByRole('tooltip')).toBeTruthy()

      // Snapshot button
      const snapBtn = screen.getByTitle('Snapshot PNG')
      snapBtn.click()
      expect(onSnapshot).toHaveBeenCalled()

      // More menu opens popover with Mutate and Randomize
      const moreBtn = screen.getByTitle('More Options')
      expect(moreBtn).toBeTruthy()
      moreBtn.click()

      const mutateBtn = screen.getByText('Mutate Flame')
      mutateBtn.click()
      expect(onMutate).toHaveBeenCalled()

      // Open menu again for Randomize
      moreBtn.click()
      const randBtn = screen.getByText('Randomize Flame')
      randBtn.click()
      expect(onRandomize).toHaveBeenCalled()
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

  describe('MobileBottomSurface', () => {
    it('renders collapsed pill bar and expands on chip tap', () => {
      const ctx = createMockCommandContext()
      const onRandomize = vi.fn()

      render(() => (
        <MobileBottomSurface
          ctx={ctx}
          flame={ctx.flameDescriptor}
          onRandomize={onRandomize}
        />
      ))

      expect(
        screen.getByRole('region', { name: 'Mobile Controls' }),
      ).toBeTruthy()
      const openVariations = screen.getByRole('button', {
        name: 'Open Variations',
      })
      expect(openVariations).toBeTruthy()

      openVariations.click()
      // Once clicked, bottom sheet expands and renders TouchControlSurface
      expect(screen.getByRole('button', { name: 'T1' })).toBeTruthy()
    })
  })

  describe('TabletInspectorDeck', () => {
    it('renders header and embedded control surface', () => {
      const ctx = createMockCommandContext()
      const onPickGallery = vi.fn()

      render(() => (
        <TabletInspectorDeck
          ctx={ctx}
          flame={ctx.flameDescriptor}
          onPickGallery={onPickGallery}
        />
      ))

      expect(
        screen.getByRole('complementary', { name: 'Tablet Touch Inspector' }),
      ).toBeTruthy()
      expect(screen.getByText('Browse Gallery')).toBeTruthy()
      const pickBtn = screen.getByRole('button', {
        name: 'Browse & load flame from gallery',
      })
      pickBtn.click()
      expect(onPickGallery).toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'T1' })).toBeTruthy()
    })
  })

  describe('TabletSplitLayout', () => {
    it('renders split layout with canvas pane and inspector pane', () => {
      const ctx = createMockCommandContext()

      render(() => (
        <TabletSplitLayout ctx={ctx} flame={ctx.flameDescriptor}>
          <div data-testid="test-canvas-pane">Canvas Hero</div>
        </TabletSplitLayout>
      ))

      expect(
        screen.getByRole('main', { name: 'Tablet Split Studio' }),
      ).toBeTruthy()
      expect(screen.getByTestId('test-canvas-pane')).toBeTruthy()
      expect(
        screen.getByRole('complementary', { name: 'Tablet Touch Inspector' }),
      ).toBeTruthy()
    })
  })
})
