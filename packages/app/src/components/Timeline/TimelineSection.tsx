import { createMemo, createSignal, Show } from 'solid-js'
import { useTimeline } from '@/contexts/TimelineContext'
import { Cross } from '@/icons'
import { persistentSignal } from '@/utils/persistentSignal'
import { AnimationControls, AnimationGenerator } from './AnimationGenerator'
import { DopeSheet } from './DopeSheet'
import ui from './TimelineSection.module.css'
import type { DopeSheetViewApi } from './DopeSheet'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export interface TimelineSectionProps {
  formatTrackLabel?: (path: string) => string
  flameDescriptor?: FlameDescriptor
  /** Controlled collapse state, used by replay follow-cam to reveal the dope sheet. */
  collapsed?: () => boolean
  setCollapsed?: (collapsed: boolean) => void
  /** Reveals the sidebar's animation generator (Flame Randomizer card). */
  onOpenAnimationGenerator?: () => void
  /** Routed through the command registry so recorder sessions see the edit. */
  onSetAutoKeyframe?: (enabled: boolean) => void
}

import { TimelineSettings } from './TimelineSettings'
import { TransportBar } from './TransportBar'

export function TimelineSection(props: TimelineSectionProps) {
  const timeline = useTimeline()!
  const [localCollapsed, setLocalCollapsed] = createSignal(false)
  const collapsed = () => props.collapsed?.() ?? localCollapsed()
  const setCollapsed = (next: boolean) => {
    if (props.setCollapsed) props.setCollapsed(next)
    else setLocalCollapsed(next)
  }
  const [presetsExpanded, setPresetsExpanded] = createSignal(false)
  const autoKeyframe = () => timeline.autoKeyframe()
  const removeMode = () => timeline.removeMode()
  const config = createMemo(() => timeline.config())
  const currentFrame = createMemo(() => timeline.currentFrame())

  // View state for the dope sheet, owned here so its controls can share the
  // header row. The zoom API is registered by the dope sheet on mount (the
  // zoom state has to live with its scroll/ruler refs).
  const [viewApi, setViewApi] = createSignal<DopeSheetViewApi | undefined>()
  const [seekOnSelect, setSeekOnSelect] = createSignal(false)
  // Persisted across sessions, but defaults OFF on first load (no stored value).
  const [showCurve, setShowCurve] = persistentSignal(
    'timeline-curve-editor',
    false,
  )

  return (
    <div
      class={ui.section}
      classList={{ [ui.collapsed as string]: collapsed() }}
      data-testid="timeline-section"
      data-tour-target="timeline-section"
    >
      {/* Single-row header: playback | settings | view | generators + keying */}
      <div class={ui.header}>
        <div class={ui.headerLeft}>
          <span class={ui.headerTitle}>Timeline</span>
        </div>

        <div class={ui.headerGroup} role="group" aria-label="Playback">
          <TransportBar />
          {/* Frame info */}
          <div class={ui.frameInfo}>
            <span class={ui.frameDisplay}>
              <span data-testid="current-frame">{currentFrame()}</span>
              <span class={ui.frameSep}>/</span>
              <span data-testid="end-frame">{config().endFrame}</span>
            </span>
          </div>
        </div>

        <div class={ui.headerGroup} role="group" aria-label="Playback settings">
          <TimelineSettings />
        </div>

        <Show when={!collapsed()}>
          <div class={ui.headerGroup} role="group" aria-label="View">
            <span class={ui.headerGroupLabel}>View</span>
            <button
              class={ui.viewBtn}
              disabled={!viewApi()}
              onClick={() => {
                const api = viewApi()
                api?.setZoomLevel(Math.max(0.1, api.zoomLevel() - 0.2))
              }}
              title="Zoom out (condense frames)"
            >
              −
            </button>
            <span class={ui.zoomLabel} data-testid="timeline-zoom">
              {Math.round((viewApi()?.zoomLevel() ?? 1) * 100)}%
            </span>
            <button
              class={ui.viewBtn}
              disabled={!viewApi()}
              onClick={() => {
                const api = viewApi()
                api?.setZoomLevel(Math.min(5, api.zoomLevel() + 0.2))
              }}
              title="Zoom in (expand frames)"
            >
              +
            </button>
            <button
              class={ui.viewBtn}
              disabled={!viewApi()}
              onClick={() => viewApi()?.autoFitZoom()}
              title="Fit all frames in view (or zoom with Alt+wheel / pinch)"
            >
              Fit
            </button>
            <button
              class={ui.viewBtn}
              classList={{ [ui.viewBtnActive as string]: seekOnSelect() }}
              onClick={() => setSeekOnSelect((v) => !v)}
              title="Seek playhead to a keyframe when selecting it"
            >
              Seek
            </button>
            <button
              class={ui.viewBtn}
              classList={{ [ui.viewBtnActive as string]: showCurve() }}
              onClick={() => setShowCurve((v) => !v)}
              title="Show the value curve for the selected parameter (Ctrl+wheel zooms its value axis)"
            >
              Curve
            </button>
          </div>
        </Show>

        {/* Right buttons */}
        <div class={ui.headerRight}>
          <Show when={props.flameDescriptor}>
            <AnimationControls
              flameDescriptor={props.flameDescriptor!}
              timeline={timeline}
              presetsExpanded={presetsExpanded()}
              onTogglePresets={() => setPresetsExpanded((p) => !p)}
              onOpenAnimationGenerator={props.onOpenAnimationGenerator}
            />
          </Show>
          <div class={ui.headerGroup} role="group" aria-label="Keyframing">
            <span class={ui.headerGroupLabel}>Keys</span>
            <button
              class={ui.autoKeyBtn}
              classList={{ [ui.active as string]: autoKeyframe() }}
              data-tour-target="auto-keyframe"
              onClick={(e) => {
                e.stopPropagation()
                const enabled = !autoKeyframe()
                if (props.onSetAutoKeyframe) {
                  props.onSetAutoKeyframe(enabled)
                } else {
                  timeline.setAutoKeyframe(enabled)
                }
              }}
              title="Auto-keyframe: re-record animated parameters as you edit them"
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
              title="Remove mode: click keyframes to delete them"
            >
              Del
            </button>
          </div>
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
          <DopeSheet
            formatTrackLabel={props.formatTrackLabel}
            flameDescriptor={props.flameDescriptor}
            seekOnSelect={seekOnSelect()}
            showCurve={showCurve()}
            registerViewApi={setViewApi}
          />
        </div>
      </Show>
    </div>
  )
}
