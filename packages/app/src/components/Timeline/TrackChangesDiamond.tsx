import { createUniqueId, Show } from 'solid-js'
import { keyframeOnChange, setKeyframeOnChange } from '@/utils/keyframeOnChange'
import ui from './TrackChangesDiamond.module.css'

/**
 * The shiny "track changes" diamond: while on, affine/color edits (scrubs,
 * dice randomizes, graph drags) drop keyframes at the current frame — creating
 * the first keyframe too, unlike the timeline's Auto mode. `compact` renders
 * just the gem (for editor canvas overlays); the default adds a label.
 */
export function TrackChangesDiamond(props: {
  compact?: boolean
  class?: string
}) {
  // Unique per instance — several diamonds render at once (affine + colour
  // canvases, list editors) and duplicate SVG ids resolve unpredictably.
  const gradientId = `tc-diamond-${createUniqueId()}`
  const title = () =>
    keyframeOnChange()
      ? 'Track changes is ON — edits, dice rolls and graph drags add keyframes at the current frame. Click to stop recording.'
      : 'Track changes: record edits (scrubs, dice rolls, graph drags) as keyframes at the current frame'
  return (
    <button
      type="button"
      class={ui.button}
      classList={{
        [props.class ?? '']: !!props.class,
        [ui.compact as string]: props.compact,
        [ui.active as string]: keyframeOnChange(),
      }}
      title={title()}
      aria-pressed={keyframeOnChange()}
      onClick={(e) => {
        e.stopPropagation()
        setKeyframeOnChange(!keyframeOnChange())
      }}
    >
      <svg class={ui.diamond} viewBox="0 0 16 16" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#c7d2fe" />
            <stop offset="0.45" stop-color="#6366f1" />
            <stop offset="1" stop-color="#4338ca" />
          </linearGradient>
        </defs>
        <path
          class={ui.gem}
          style={{
            fill: keyframeOnChange() ? `url(#${gradientId})` : undefined,
          }}
          d="M8 1.5 L14.5 8 L8 14.5 L1.5 8 Z"
        />
        <path class={ui.facet} d="M8 1.5 V14.5 M1.5 8 H14.5" />
        <path class={ui.shine} d="M5.2 5.6 L6.8 4" />
      </svg>
      <Show when={!props.compact}>
        <span class={ui.label}>Track changes</span>
      </Show>
    </button>
  )
}
