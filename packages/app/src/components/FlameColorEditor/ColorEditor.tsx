import { createSignal, Show } from 'solid-js'
// Reuse the affine editor's tab styling so the two editors look/behave the same.
import tabUi from '@/components/AffineEditor/AffineEditor.module.css'
import { GridIcon, ListIcon } from '@/icons'
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
}) {
  const [view, setView] = createSignal<ColorView>('grid')

  return (
    <div>
      <div class={tabUi.tabs}>
        <button
          class={tabUi.tab}
          classList={{ [tabUi.tabActive as string]: view() === 'grid' }}
          onClick={() => setView('grid')}
          title="Color wheel"
        >
          <GridIcon class={tabUi.tabIcon} />
        </button>
        <button
          class={tabUi.tab}
          classList={{ [tabUi.tabActive as string]: view() === 'list' }}
          onClick={() => setView('list')}
          title="Color values (scrub + keyframe)"
        >
          <ListIcon class={tabUi.tabIcon} />
        </button>
      </div>
      <Show
        when={view() === 'grid'}
        fallback={
          <ColorListEditor
            transforms={props.transforms}
            setTransforms={props.setTransforms}
          />
        }
      >
        <FlameColorEditor
          transforms={props.transforms}
          setTransforms={props.setTransforms}
          selectedTransformId={props.selectedTransformId}
          setSelectedTransformId={props.setSelectedTransformId}
        />
      </Show>
    </div>
  )
}
