import { Show } from 'solid-js'
import { keyframeOnChange, setKeyframeOnChange } from '@/utils/keyframeOnChange'
import ui from './TrackChangesDiamond.module.css'

/**
 * The "track changes" recording toggle: while on, affine/color edits (scrubs,
 * dice randomizes, graph drags) drop keyframes at the current frame — creating
 * the first keyframe too, unlike the timeline's Auto mode. Amber when active,
 * matching the per-parameter keyframe diamonds it writes; outline when off.
 * `compact` renders just the diamond (for editor canvas overlays); the
 * default adds a label.
 */
export function TrackChangesDiamond(props: {
  compact?: boolean
  class?: string
}) {
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
        <path class={ui.gem} d="M8 1.5 L14.5 8 L8 14.5 L1.5 8 Z" />
      </svg>
      <Show when={!props.compact}>
        <span class={ui.label}>Track changes</span>
      </Show>
    </button>
  )
}
