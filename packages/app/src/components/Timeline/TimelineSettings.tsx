import { createMemo } from 'solid-js'
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
          onChange={() => {
            timeline.setConfig({ ...config(), loop: !config().loop })
          }}
          data-testid="loop-toggle"
        />
      </label>
    </div>
  )
}
