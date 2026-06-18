import { createMemo, Show } from 'solid-js'
import { useTimeline } from '@/contexts/TimelineContext'
import ui from './TimelineSection.module.css'

function createSettingScrubber(
  getValue: () => number,
  setValue: (v: number) => void,
  step: number,
  min: number,
  max: number,
) {
  let scrubbing = false
  return function onPointerDown(e: PointerEvent) {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'BUTTON') return

    scrubbing = true
    const startX = e.clientX
    const startValue = getValue()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    function onMove(ev: PointerEvent) {
      if (!scrubbing) return
      const dx = ev.clientX - startX
      const sensitivity = ev.shiftKey ? 0.1 : 1
      let newValue = startValue + dx * step * sensitivity
      newValue = Math.max(min, Math.min(max, Math.round(newValue)))
      setValue(newValue)
    }

    function onUp() {
      scrubbing = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
}

export function TimelineSettings() {
  const timeline = useTimeline()!
  const config = createMemo(() => timeline.config())

  return (
    <div class={ui.settingsBar}>
      <label
        class={ui.settingItem}
        onPointerDown={createSettingScrubber(
          () => config().fps,
          (v) => timeline.setConfig({ ...config(), fps: v }),
          0.2,
          1,
          60,
        )}
      >
        <span class={ui.settingLabel}>FPS</span>
        <input
          type="number"
          class={ui.settingInput}
          value={config().fps}
          min={1}
          max={60}
          step={1}
          onChange={(e) => {
            timeline.setConfig({
              ...config(),
              fps: Math.round(Number(e.currentTarget.value)),
            })
          }}
        />
      </label>
      <label class={ui.settingItem}>
        <span class={ui.settingLabel}>Auto FPS</span>
        <input
          type="checkbox"
          class={ui.settingCheckbox}
          checked={config().autoFps ?? false}
          onChange={(e) => {
            timeline.setConfig({
              ...config(),
              autoFps: !(config().autoFps ?? false),
            })
            // Don't keep keyboard focus on the checkbox, otherwise the next
            // Space press toggles it again instead of starting playback.
            e.currentTarget.blur()
          }}
          title="Auto FPS: Wait for each frame to render to target quality before advancing"
        />
      </label>
      <Show
        when={
          (config().autoFps ?? false) &&
          timeline.isPlaying() &&
          timeline.measuredFps() !== undefined
        }
      >
        <span
          class={ui.measuredFps}
          title="Actual playback rate while waiting for each frame to reach the quality target"
        >
          <span class={ui.measuredFpsDot} />
          {timeline.measuredFps()!.toFixed(1)}
          <span class={ui.measuredFpsUnit}>fps</span>
        </span>
      </Show>
      <label
        class={ui.settingItem}
        onPointerDown={createSettingScrubber(
          () => config().endFrame,
          (v) => timeline.setConfig({ ...config(), endFrame: v }),
          0.5,
          1,
          999,
        )}
      >
        <span class={ui.settingLabel}>Frames</span>
        <input
          type="number"
          class={ui.settingInput}
          value={config().endFrame}
          min={1}
          step={1}
          onChange={(e) => {
            timeline.setConfig({
              ...config(),
              endFrame: Math.round(Number(e.currentTarget.value)),
            })
          }}
        />
      </label>
      <label
        class={ui.settingItem}
        onPointerDown={createSettingScrubber(
          () => config().timeScale,
          (v) => timeline.setConfig({ ...config(), timeScale: v }),
          0.1,
          1,
          10,
        )}
      >
        <span class={ui.settingLabel}>Speed</span>
        <input
          type="number"
          class={ui.settingInput}
          value={config().timeScale}
          min={1}
          max={10}
          step={1}
          onChange={(e) => {
            timeline.setConfig({
              ...config(),
              timeScale: Math.round(Number(e.currentTarget.value)),
            })
          }}
        />
      </label>
      <label class={ui.settingItem}>
        <span class={ui.settingLabel}>Loop</span>
        <input
          type="checkbox"
          class={ui.settingCheckbox}
          checked={config().loop}
          onChange={(e) => {
            timeline.setConfig({ ...config(), loop: !config().loop })
            // Release focus so Space starts playback instead of re-toggling.
            e.currentTarget.blur()
          }}
          data-testid="loop-toggle"
        />
      </label>
      <Show when={timeline.tracks().length > 0}>
        <label
          class={ui.settingItem}
          title="Seamless loop: synthesize a return ramp (last keyframe → start) so playback loops like a GIF — no keyframes added. On a morph this makes an A → B → A cycle."
        >
          <span class={ui.settingLabel}>Seamless</span>
          <input
            type="checkbox"
            class={ui.settingCheckbox}
            checked={config().seamlessLoop ?? false}
            onChange={(e) => {
              timeline.toggleSeamlessLoop()
              // Release focus so Space starts playback instead of re-toggling.
              e.currentTarget.blur()
            }}
            data-testid="seamless-toggle"
          />
        </label>
      </Show>
    </div>
  )
}
