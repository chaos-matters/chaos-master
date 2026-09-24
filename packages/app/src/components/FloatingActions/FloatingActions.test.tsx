import { fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { cancelSessionRecording, startSessionRecording, } from '@/recorder/recorder'
import { recorderVisible, setRecorderExportPending, setRecorderSavePending, setRecorderVisible, } from '../SessionRecorder/recorderUi'
import { FloatingActions } from './FloatingActions'
import type { ComponentProps } from 'solid-js'

type TimelineProps = Partial<
  Pick<
    ComponentProps<typeof FloatingActions>,
    | 'showTimeline'
    | 'setShowTimeline'
    | 'animationEnabled'
    | 'setAnimationEnabled'
  >
>

function renderFloatingActions(
  initiallyCollapsed = false,
  timeline: TimelineProps = {},
) {
  const [collapsed, setCollapsed] = createSignal(initiallyCollapsed)
  const noop = vi.fn()
  const result = render(() => (
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
      animationEnabled={timeline.animationEnabled ?? (() => false)}
      setAnimationEnabled={timeline.setAnimationEnabled ?? noop}
      showTimeline={timeline.showTimeline ?? (() => false)}
      setShowTimeline={timeline.setShowTimeline ?? noop}
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
  return { ...result, collapsed }
}

describe('FloatingActions controlled collapse', () => {
  it('mounts replay-focus targets again when expanded', () => {
    const { collapsed, unmount } = renderFloatingActions(true)

    expect(
      document.querySelector('[data-tour-target="quality-presets"]'),
    ).toBeNull()
    fireEvent.click(screen.getByTitle('Tap to expand'))
    expect(collapsed()).toBe(false)
    expect(
      document.querySelector('[data-tour-target="quality-presets"]'),
    ).not.toBeNull()
    for (const target of [
      'new-flame',
      'load-flame',
      'show-timeline',
      'stochastic-filter',
      'adaptive-filter',
      'dimension-toggle',
    ]) {
      expect(
        document.querySelector(`[data-tour-target="${target}"]`),
      ).not.toBeNull()
    }

    unmount()
  })
})

describe('FloatingActions recorder toggle', () => {
  beforeEach(() => {
    cancelSessionRecording()
    setRecorderExportPending(false)
    setRecorderSavePending(false)
    setRecorderVisible(true)
  })

  afterEach(() => {
    cancelSessionRecording()
    setRecorderExportPending(false)
    setRecorderSavePending(false)
    setRecorderVisible(true)
  })

  it('cannot hide the recorder while a recording is active', () => {
    const { unmount } = renderFloatingActions()
    const toggle = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Hide the step recorder',
    })

    expect(toggle.disabled).toBe(false)
    expect(startSessionRecording(examples.example1)).toEqual({ ok: true })

    expect(toggle.disabled).toBe(true)
    expect(toggle.title).toBe('Stop or discard the recording first')
    expect(toggle.getAttribute('aria-label')).toBe(
      'Stop or discard the recording first',
    )

    fireEvent.click(toggle)
    expect(recorderVisible()).toBe(true)

    cancelSessionRecording()
    expect(toggle.disabled).toBe(false)
    expect(toggle.title).toBe('Hide the step recorder')

    fireEvent.click(toggle)
    expect(recorderVisible()).toBe(false)
    unmount()
  })

  it('cannot hide the recorder while a full-interface export is active', () => {
    const { unmount } = renderFloatingActions()
    const toggle = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Hide the step recorder',
    })

    setRecorderExportPending(true)

    expect(toggle.disabled).toBe(true)
    expect(toggle.title).toBe('Wait for the replay video recording to finish')
    fireEvent.click(toggle)
    expect(recorderVisible()).toBe(true)

    setRecorderExportPending(false)
    expect(toggle.disabled).toBe(false)
    unmount()
  })
})

describe('FloatingActions timeline toggle while no frame has been drawn', () => {
  // The toggle used to work out the new state at the click and apply it
  // inside document.startViewTransition's callback, a frame later, while the
  // transition sent every click on the page to <html>. Measured in headed
  // Chrome, a second click inside that window was lost, so two clicks left
  // the timeline toggled once. The stub never runs its callback, a renderer
  // with no frame yet; jsdom has none, and would test the other branch.
  beforeEach(() => {
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: () => ({ ready: Promise.resolve(), finished: Promise.resolve() }),
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(document, 'startViewTransition')
  })

  it('hides and shows the timeline at each of two clicks', () => {
    const [showTimeline, setShowTimeline] = createSignal(true)
    const [animationEnabled, setAnimationEnabled] = createSignal(true)
    const { unmount } = renderFloatingActions(false, {
      showTimeline,
      setShowTimeline,
      animationEnabled,
      setAnimationEnabled,
    })
    const toggle = screen.getByTitle('Hide timeline (also disables animation)')

    fireEvent.click(toggle)
    expect(showTimeline()).toBe(false)
    // Hiding the timeline stops the animation it drives.
    expect(animationEnabled()).toBe(false)

    fireEvent.click(toggle)
    expect(showTimeline()).toBe(true)
    unmount()
  })
})
