import { createMemo, For, Show } from 'solid-js'
import { vec2f } from 'typegpu/data'
import { DiceButton } from '@/components/DiceButton/DiceButton'
import { handleColor } from '@/components/FlameColorEditor/FlameColorEditor'
import { ScrubInput } from '@/components/Sliders/ScrubInput'
import { useTheme } from '@/contexts/ThemeContext'
import { useTimeline } from '@/contexts/TimelineContext'
import { randomizeAffineCoef } from '@/flame/randomize'
import { buildReadableIds } from '@/utils/readableIds'
import { recordEntries } from '@/utils/record'
import ui from './AffineListEditor.module.css'
import type { TransformRecord } from '@/flame/schema/flameSchema'
import type { HistorySetter } from '@/utils/createStoreHistory'

const COEFFICIENTS = [
  { key: 'a', label: 'a' },
  { key: 'b', label: 'b' },
  { key: 'c', label: 'c' },
  { key: 'd', label: 'd' },
  { key: 'e', label: 'e' },
  { key: 'f', label: 'f' },
] as const

type AffineListEditorProps = {
  transforms: TransformRecord
  setTransforms: HistorySetter<TransformRecord>
}

export function AffineListEditor(props: AffineListEditorProps) {
  const { theme } = useTheme()
  const timeline = useTimeline()

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
              <Show when={timeline?.animationEnabled()}>
                <span class={ui.transformLabel}>
                  {readableIds().transformLabel[tid]}
                </span>
              </Show>
              <DiceButton
                title="Randomize affine coefs"
                onClick={() => {
                  props.setTransforms((draft) => {
                    const coefs = draft[tid]!.preAffine
                    for (const key of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
                      coefs[key] = randomizeAffineCoef(coefs[key], key)
                    }
                  })
                }}
              />
            </div>
            <div class={ui.coefficients}>
              <For each={COEFFICIENTS}>
                {({ key, label }) => (
                  <ScrubInput
                    label={label}
                    value={transform.preAffine[key]}
                    step={0.001}
                    onInput={(val) => {
                      props.setTransforms((draft) => {
                        draft[tid]!.preAffine[key] = val
                      })
                    }}
                    dataParameterPath={`transform.${tid}.preAffine.${key}`}
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
