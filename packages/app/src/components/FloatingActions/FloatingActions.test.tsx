import { fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { cancelSessionRecording, startSessionRecording, } from '@/recorder/recorder'
import { recorderVisible, setRecorderExportPending, setRecorderSavePending, setRecorderVisible, } from '../SessionRecorder/recorderUi'
import { FloatingActions } from './FloatingActions'

function renderFloatingActions(initiallyCollapsed = false) {
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
