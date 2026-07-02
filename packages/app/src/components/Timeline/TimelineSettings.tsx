import { createMemo, Show } from 'solid-js'
import { useTimeline } from '@/contexts/TimelineContext'
import ui from './TimelineSection.module.css'
import type { LoopMode } from '@/utils/timeline'

function createSettingScrubber(
  getValue: () => number,
  setValue: (v: number) => void,
  step: number,
  min: number,
  max: number,
  onGestureEnd?: () => void,
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
      onGestureEnd?.()
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
          (v) => {
            timeline.updateConfigUndoable({ fps: v }, 'fps')
          },
          0.2,
          1,
          60,
          () => {
            timeline.breakUndoCoalescing()
          },
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
            timeline.updateConfigUndoable({
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
            timeline.updateConfigUndoable({
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
          (v) => {
            timeline.updateConfigUndoable({ endFrame: v }, 'endFrame')
          },
          0.5,
          1,
          999,
          () => {
            timeline.breakUndoCoalescing()
          },
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
            timeline.updateConfigUndoable({
              endFrame: Math.round(Number(e.currentTarget.value)),
            })
          }}
        />
      </label>
      <label
        class={ui.settingItem}
        onPointerDown={createSettingScrubber(
          () => config().timeScale,
          (v) => {
            timeline.updateConfigUndoable({ timeScale: v }, 'timeScale')
          },
          0.1,
          1,
          10,
          () => {
            timeline.breakUndoCoalescing()
          },
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
            timeline.updateConfigUndoable({
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
            timeline.updateConfigUndoable({ loop: !config().loop })
            // Release focus so Space starts playback instead of re-toggling.
            e.currentTarget.blur()
          }}
          data-testid="loop-toggle"
        />
      </label>
      <Show when={timeline.tracks().length > 0}>
        <label
          class={ui.settingItem}
          title={
            'Loop style (adds no keyframes):\n' +
            '• Seamless — there-and-back: play A→B then a synthesized B→A return.\n' +
            '• Cycle — per-property wrap over the timeline; each track flows from its last keyframe back to its first, respecting its own timing.'
          }
        >
          <span class={ui.settingLabel}>Loop Style</span>
          <select
            class={ui.settingSelect}
            value={config().loopMode ?? 'off'}
            onChange={(e) => {
              timeline.setLoopMode(e.currentTarget.value as LoopMode)
              // Release focus so Space starts playback instead of reopening.
              e.currentTarget.blur()
            }}
            data-testid="loop-mode"
          >
            <option value="off">None</option>
            <option value="seamless">Seamless</option>
            <option value="cycle">Cycle</option>
          </select>
        </label>
      </Show>
    </div>
  )
}
