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

import { TimelineSettings } from './TimelineSettings'
import { TransportBar } from './TransportBar'

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

        <TransportBar />

        {/* Frame info */}
        <div class={ui.frameInfo}>
          <span class={ui.frameDisplay}>
            <span data-testid="current-frame">{currentFrame()}</span>
            <span class={ui.frameSep}>/</span>
            <span data-testid="end-frame">{config().endFrame}</span>
          </span>
        </div>

        <TimelineSettings />

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
