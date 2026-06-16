import { createMemo, For } from 'solid-js'
import { vec2f } from 'typegpu/data'
// Reuse the affine list's styling so the two scrub views look consistent.
import ui from '@/components/AffineEditor/AffineListEditor.module.css'
import { DiceButton } from '@/components/DiceButton/DiceButton'
import { ResetButton } from '@/components/ResetButton/ResetButton'
import { ScrubInput } from '@/components/Sliders/ScrubInput'
import { useTheme } from '@/contexts/ThemeContext'
import { randomRange } from '@/flame/randomize'
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
  selectedTransformId?: () => string | null
  setSelectedTransformId?: (tid: string | null) => void
}) {
  const { theme } = useTheme()
  const readableIds = createMemo(() => buildReadableIds(props.transforms))

  return (
    <div class={ui.container}>
      <For each={recordEntries(props.transforms)}>
        {([tid, transform]) => {
          const color = () =>
            handleColor(theme(), vec2f(transform.color.x, transform.color.y))
          const isSelected = () => props.selectedTransformId?.() === tid
          const isDimmed = () =>
            !!props.selectedTransformId?.() && !isSelected()
          const toggleSelect = () =>
            props.setSelectedTransformId?.(isSelected() ? null : tid)
          return (
            <div
              class={ui.transformCard}
              classList={{
                [ui.selected as string]: isSelected(),
                [ui.dimmed as string]: isDimmed(),
              }}
              style={isSelected() ? { '--accent-color': color() } : undefined}
            >
              <div class={ui.transformHeader}>
                <span
                  class={ui.colorBadge}
                  style={{ background: color() }}
                  role="button"
                  tabindex={0}
                  aria-pressed={isSelected()}
                  aria-label={`${isSelected() ? 'Deselect' : 'Select'} ${readableIds().transformLabel[tid]}`}
                  onClick={toggleSelect}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleSelect()
                    }
                  }}
                />
                <span class={ui.transformLabel}>
                  {readableIds().transformLabel[tid]}
                </span>
                <DiceButton
                  title="Randomize color"
                  onClick={() => {
                    props.setTransforms((draft) => {
                      draft[tid]!.color = {
                        x: randomRange(-0.4, 0.4),
                        y: randomRange(-0.4, 0.4),
                      }
                    })
                  }}
                />
                <ResetButton
                  title="Reset color to neutral (0, 0)"
                  onClick={() => {
                    props.setTransforms((draft) => {
                      draft[tid]!.color = { x: 0, y: 0 }
                    })
                  }}
                />
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
          )
        }}
      </For>
    </div>
  )
}
