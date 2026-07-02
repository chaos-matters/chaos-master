import { createSignal, Show } from 'solid-js'
import { GridIcon, ListIcon } from '@/icons'
import ui from './ColorEditor.module.css'
import { ColorListEditor } from './ColorListEditor'
import { FlameColorEditor } from './FlameColorEditor'
import type { TransformRecord } from '@/flame/schema/flameSchema'
import type { HistorySetter } from '@/utils/createStoreHistory'

type ColorView = 'grid' | 'list'

/**
 * Color editor with a grid/list toggle (mirrors the affine editor):
 * - "grid": the circular OkLab color wheel with draggable handles.
 * - "list": per-transform scrub inputs for the a/b color components, with
 *   timeline keyframe diamonds + auto-keyframing.
 */
export function ColorEditor(props: {
  transforms: TransformRecord
  setTransforms: HistorySetter<TransformRecord>
  selectedTransformId?: () => string | null
  setSelectedTransformId?: (tid: string | null) => void
  /** Enables the track-changes diamond + drag keyframing (real flame only). */
  enableChangeTracking?: boolean
}) {
  const [view, setView] = createSignal<ColorView>('grid')

  return (
    <div class={ui.root}>
      <div class={ui.tabs}>
        <button
          class={ui.tab}
          classList={{ [ui.tabActive as string]: view() === 'grid' }}
          onClick={() => setView('grid')}
          title="Color wheel"
        >
          <GridIcon class={ui.tabIcon} />
        </button>
        <button
          class={ui.tab}
          classList={{ [ui.tabActive as string]: view() === 'list' }}
          onClick={() => setView('list')}
          title="Color values (scrub + keyframe)"
        >
          <ListIcon class={ui.tabIcon} />
        </button>
      </div>
      <Show
        when={view() === 'grid'}
        fallback={
          <div class={ui.listWrap}>
            <ColorListEditor
              transforms={props.transforms}
              setTransforms={props.setTransforms}
              selectedTransformId={props.selectedTransformId}
              setSelectedTransformId={props.setSelectedTransformId}
              enableChangeTracking={props.enableChangeTracking}
            />
          </div>
        }
      >
        <FlameColorEditor
          transforms={props.transforms}
          setTransforms={props.setTransforms}
          selectedTransformId={props.selectedTransformId}
          setSelectedTransformId={props.setSelectedTransformId}
          enableChangeTracking={props.enableChangeTracking}
        />
      </Show>
    </div>
  )
}
