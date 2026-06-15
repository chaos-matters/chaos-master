import { createMemo, For } from 'solid-js'
import { vec2f } from 'typegpu/data'
// Reuse the affine list's styling so the two scrub views look consistent.
import ui from '@/components/AffineEditor/AffineListEditor.module.css'
import { ScrubInput } from '@/components/Sliders/ScrubInput'
import { useTheme } from '@/contexts/ThemeContext'
import { buildReadableIds } from '@/utils/readableIds'
import { recordEntries } from '@/utils/record'
import { handleColor } from './FlameColorEditor'
import type { TransformRecord } from '@/flame/schema/flameSchema'
import type { HistorySetter } from '@/utils/createStoreHistory'

// The flame color is an OkLab (a, b) coordinate stored as { x, y }. Exposing
// both axes as scrub inputs gives precise editing and — because each carries a
// dataParameterPath — timeline keyframe diamonds + auto-keyframing, the same way
// the affine coefficients animate. The apply/read of these paths
// (transform.{tid}.color.{x,y}) already exists in MainWorkspace.
const COLOR_COMPONENTS = [
  { key: 'x', label: 'a' },
  { key: 'y', label: 'b' },
] as const

export function ColorListEditor(props: {
  transforms: TransformRecord
  setTransforms: HistorySetter<TransformRecord>
}) {
  const { theme } = useTheme()
  const readableIds = createMemo(() => buildReadableIds(props.transforms))

  return (
    <div class={ui.container}>
      <For each={recordEntries(props.transforms)}>
        {([tid, transform]) => (
          <div class={ui.transformCard}>
            <div class={ui.transformHeader}>
              <span
                class={ui.colorBadge}
                style={{
                  background: handleColor(
                    theme(),
                    vec2f(transform.color.x, transform.color.y),
                  ),
                }}
              />
              <span class={ui.transformLabel}>
                {readableIds().transformLabel[tid]}
              </span>
            </div>
            <div class={ui.coefficients}>
              <For each={COLOR_COMPONENTS}>
                {(comp) => (
                  <ScrubInput
                    label={comp.label}
                    value={transform.color[comp.key]}
                    step={0.001}
                    onInput={(val) => {
                      props.setTransforms((draft) => {
                        draft[tid]!.color[comp.key] = val
                      })
                    }}
                    dataParameterPath={`transform.${tid}.color.${comp.key}`}
                  />
                )}
              </For>
            </div>
          </div>
        )}
      </For>
    </div>
  )
}
