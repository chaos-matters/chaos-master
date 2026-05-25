import { For, Show } from 'solid-js'
import ui from './DopeSheet.module.css'
import { DopeSheetTrack } from './DopeSheetTrack'

interface DopeSheetGridProps {
  tracksScrollRef: (el: HTMLDivElement) => void
  onScroll: (
    e: Event & { currentTarget: HTMLDivElement; target: Element },
  ) => void
  activeTracks: Array<{ path: string; label: string; isOrphaned: boolean }>
  frameWidth: number
  trackHeight: number
  startFrame: number
  endFrame: number
  currentFrame: number
  selectedKeyframe: { path: string; frame: number } | null
  onSelectKeyframe: (path: string, frame: number) => void
  onDragKeyframe: (path: string, oldFrame: number, newFrame: number) => void
  onContextMenu: (e: MouseEvent, path: string, frame: number) => void
  onTrackContextMenu?: (e: MouseEvent, path: string) => void
  onDeselectKeyframe: () => void
  trackNameWidth: number
}

export function DopeSheetGrid(props: DopeSheetGridProps) {
  return (
    <div
      class={ui.tracksScroll}
      ref={props.tracksScrollRef}
      onScroll={props.onScroll}
    >
      <Show
        when={props.activeTracks.length > 0}
        fallback={
          <div class={ui.emptyState}>
            No keyframes. Click a property and press <kbd>I</kbd> to insert one.
          </div>
        }
      >
        <For each={props.activeTracks}>
          {(track) => (
            <DopeSheetTrack
              isOrphaned={track.isOrphaned}
              parameterPath={track.path}
              label={track.label}
              frameWidth={props.frameWidth}
              trackHeight={props.trackHeight}
              startFrame={props.startFrame}
              endFrame={props.endFrame}
              currentFrame={props.currentFrame}
              selectedKeyframe={props.selectedKeyframe}
              onSelectKeyframe={props.onSelectKeyframe}
              onDragKeyframe={props.onDragKeyframe}
              onContextMenu={props.onContextMenu}
              onTrackContextMenu={props.onTrackContextMenu}
              onDeselectKeyframe={props.onDeselectKeyframe}
            />
          )}
        </For>
      </Show>

      {/* Playhead line in tracks */}
      <div
        class={ui.playhead}
        style={{
          left: `${
            props.trackNameWidth +
            (props.currentFrame - props.startFrame) * props.frameWidth
          }px`,
        }}
      />
    </div>
  )
}
