import { cleanup, render } from '@solidjs/testing-library'
import { vec2f } from 'typegpu/data'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimelineProvider } from '@/contexts/TimelineContext'
import { ViewControls } from './ViewControls'

describe('ViewControls Component', () => {
  afterEach(cleanup)

  it('renders controls and supports horizontal wheel scrolling', () => {
    const setPixelRatio = vi.fn()
    const setZoom = vi.fn()
    const setPosition = vi.fn()

    const { container } = render(() => (
      <TimelineProvider>
        <ViewControls
          pixelRatio={1}
          setPixelRatio={setPixelRatio}
          zoom={1}
          setZoom={setZoom}
          position={vec2f(0, 0)}
          setPosition={setPosition}
          blendWeight={0.5}
          onPickBlendFlame={vi.fn()}
          onMorphFlame={vi.fn()}
          onBreedFlame={vi.fn()}
          onEvolveFlame={vi.fn()}
          onSimulatorFlame={vi.fn()}
          onDiffFlame={vi.fn()}
          onAncestryFlame={vi.fn()}
          onGalleryFlame={vi.fn()}
          onClearBlendFlame={vi.fn()}
          onBlendWeightChange={vi.fn()}
        />
      </TimelineProvider>
    ))

    const controlsEl = container.querySelector(
      '[class*="viewControls"]',
    ) as HTMLElement
    expect(controlsEl).toBeDefined()

    // Test horizontal wheel scrolling on the container
    controlsEl.scrollLeft = 0
    const wheelEvent = new WheelEvent('wheel', {
      deltaY: 150,
      deltaX: 0,
      cancelable: true,
      bubbles: true,
    })
    controlsEl.dispatchEvent(wheelEvent)

    expect(controlsEl.scrollLeft).toBe(150)
    expect(wheelEvent.defaultPrevented).toBe(true)
  })
})
