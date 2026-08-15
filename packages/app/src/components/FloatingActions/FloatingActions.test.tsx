import { fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'
import { FloatingActions } from './FloatingActions'

describe('FloatingActions controlled collapse', () => {
  it('mounts replay-focus targets again when expanded', () => {
    const [collapsed, setCollapsed] = createSignal(true)
    const noop = vi.fn()
    const { unmount } = render(() => (
      <FloatingActions
        initialLeft={100}
        initialTop={100}
        onNewFlame={noop}
        onLoadFlame={noop}
        onSaveForLater={noop}
        onRender={noop}
        onQuickExport={noop}
        onShareLink={noop}
        onShareDiscord={noop}
        onLogoFavicon={noop}
        onRandomizeColors={noop}
        hideDiceButtons={() => false}
        setHideDiceButtons={noop}
        animationEnabled={() => false}
        setAnimationEnabled={noop}
        showTimeline={() => false}
        setShowTimeline={noop}
        adaptiveFilterEnabled={() => true}
        setAdaptiveFilterEnabled={noop}
        stochasticFilterEnabled={() => false}
        setStochasticFilterEnabled={noop}
        dimensions={() => 2}
        setDimensions={noop}
        flyMode={() => false}
        setFlyMode={noop}
        sidebarOpen={() => true}
        onToggleSidebar={noop}
        isPlaying={() => false}
        togglePlay={noop}
        qualityPreset={() => 'mid'}
        setQualityPreset={noop}
        accumulatedPointCount={() => 0}
        qualityPointCountLimit={() => 1}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />
    ))

    expect(
      document.querySelector('[data-tour-target="quality-presets"]'),
    ).toBeNull()
    fireEvent.click(screen.getByTitle('Tap to expand'))
    expect(collapsed()).toBe(false)
    expect(
      document.querySelector('[data-tour-target="quality-presets"]'),
    ).not.toBeNull()

    unmount()
  })
})
