import { createMemo, createSignal, Show } from 'solid-js'
import { useTimeline } from '@/contexts/TimelineContext'
import { Cross } from '@/icons'
import { AnimationControls, AnimationGenerator } from './AnimationGenerator'
import { DopeSheet } from './DopeSheet'
import ui from './TimelineSection.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export interface TimelineSectionProps {
  formatTrackLabel?: (path: string) => string
  flameDescriptor?: FlameDescriptor
}

function createSettingScrubber(
  getValue: () => number,
  setValue: (v: number) => void,
  step: number,
  min: number,
  max: number,
) {
  let scrubbing = false
  return function onPointerDown(e: PointerEvent) {
    // Don't start scrub if clicking directly on an input or button
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

export function TimelineSection(props: TimelineSectionProps) {
  const timeline = useTimeline()!
  const [collapsed, setCollapsed] = createSignal(false)
  const [presetsExpanded, setPresetsExpanded] = createSignal(false)
  const isPlaying = () => timeline.isPlaying()
  const autoKeyframe = () => timeline.autoKeyframe()
  const removeMode = () => timeline.removeMode()
  const config = createMemo(() => timeline.config())
  const currentFrame = createMemo(() => timeline.currentFrame())

  return (
    <div
      class={ui.section}
      classList={{ [ui.collapsed as string]: collapsed() }}
      data-testid="timeline-section"
    >
      {/* Compact transport bar */}
      <div class={ui.header}>
        <div class={ui.headerLeft}>
          <span
            class={ui.playDot}
            classList={{ [ui.playing as string]: isPlaying() }}
            title={isPlaying() ? 'Playing' : 'Paused'}
          />
          <span class={ui.headerTitle}>Timeline</span>
          <span
            class={ui.shortcutHint}
            title="Space: play/pause · I: insert keyframe"
          >
            <kbd>Space</kbd> <kbd>I</kbd>
          </span>
        </div>

        {/* Transport controls */}
        <div class={ui.transportControls}>
          <button
            class={ui.transportBtn}
            onClick={() => {
              timeline.goToFrame(config().startFrame)
            }}
            title="Go to start"
            data-testid="go-to-start"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
              <path d="M3 3h2v10H3V3zm3 5l8-5v10L6 8z" />
            </svg>
          </button>
          <button
            class={ui.transportBtn}
            onClick={() => {
              timeline.goBackFrame()
            }}
            title="Previous frame"
            data-testid="previous-frame"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
              <path d="M11 3L4 8l7 5V3z" />
            </svg>
          </button>
          <button
            class={ui.transportBtn}
            classList={{ [ui.active as string]: isPlaying() }}
            data-tour-target="play-button"
            onClick={() => {
              timeline.togglePlay()
            }}
            title="Play/Pause"
            data-testid={isPlaying() ? 'pause' : 'play'}
          >
            {isPlaying() ? (
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                width="13"
                height="13"
              >
                <path d="M4 2h3v12H4V2zm5 0h3v12H9V2z" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                width="13"
                height="13"
              >
                <path d="M4 2l10 6-10 6V2z" />
              </svg>
            )}
          </button>
          <button
            class={ui.transportBtn}
            onClick={() => {
              timeline.advanceFrame()
            }}
            title="Next frame"
            data-testid="next-frame"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
              <path d="M5 3l7 5-7 5V3z" />
            </svg>
          </button>
          <button
            class={ui.transportBtn}
            onClick={() => {
              timeline.goToFrame(config().endFrame)
            }}
            title="Go to end"
            data-testid="go-to-end"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
              <path d="M11 3h2v10h-2V3zM1 3l8 5-8 5V3z" />
            </svg>
          </button>
        </div>

        {/* Frame info */}
        <div class={ui.frameInfo}>
          <span class={ui.frameDisplay}>
            <span data-testid="current-frame">{currentFrame()}</span>
            <span class={ui.frameSep}>/</span>
            <span data-testid="end-frame">{config().endFrame}</span>
          </span>
        </div>

        {/* Compact settings */}
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

        {/* Right buttons */}
        <div class={ui.headerRight}>
          <Show when={props.flameDescriptor}>
            <AnimationControls
              flameDescriptor={props.flameDescriptor!}
              timeline={timeline}
              presetsExpanded={presetsExpanded()}
              onTogglePresets={() => setPresetsExpanded((p) => !p)}
            />
          </Show>
          <button
            class={ui.autoKeyBtn}
            classList={{ [ui.active as string]: autoKeyframe() }}
            data-tour-target="auto-keyframe"
            onClick={(e) => {
              e.stopPropagation()
              timeline.setAutoKeyframe(!autoKeyframe())
            }}
            title="Auto-keyframe"
          >
            Auto
          </button>
          <button
            class={ui.removeBtn}
            classList={{ [ui.active as string]: removeMode() }}
            data-tour-target="del-mode"
            onClick={(e) => {
              e.stopPropagation()
              timeline.setRemoveMode(!removeMode())
            }}
            title="Remove mode"
          >
            Del
          </button>
          <button
            class={ui.collapseBtn}
            onClick={(e) => {
              e.stopPropagation()
              setCollapsed(!collapsed())
            }}
            title={collapsed() ? 'Expand' : 'Collapse'}
            data-testid="timeline-collapse"
          >
            <span classList={{ [ui.rotated as string]: collapsed() }}>
              <Cross />
            </span>
          </button>
        </div>
      </div>

      <Show when={!collapsed()}>
        <Show when={props.flameDescriptor}>
          <AnimationGenerator
            flameDescriptor={props.flameDescriptor!}
            timeline={timeline}
            expanded={presetsExpanded()}
          />
        </Show>
        <div class={ui.content}>
          <DopeSheet formatTrackLabel={props.formatTrackLabel} />
        </div>
      </Show>
    </div>
  )
}
