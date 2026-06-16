import { createMemo, For, Show } from 'solid-js'
import { vec2f } from 'typegpu/data'
import { DiceButton } from '@/components/DiceButton/DiceButton'
import { handleColor } from '@/components/FlameColorEditor/FlameColorEditor'
import { ResetButton } from '@/components/ResetButton/ResetButton'
import { ScrubInput } from '@/components/Sliders/ScrubInput'
import { useTheme } from '@/contexts/ThemeContext'
import { useTimeline } from '@/contexts/TimelineContext'
import { randomizeAffineCoef } from '@/flame/randomize'
import { buildReadableIds } from '@/utils/readableIds'
import { recordEntries } from '@/utils/record'
import ui from './AffineListEditor.module.css'
import type { TransformRecord } from '@/flame/schema/flameSchema'
import type { HistorySetter } from '@/utils/createStoreHistory'

export type AffineListEditorProps = {
  transforms: TransformRecord
  setTransforms: HistorySetter<TransformRecord>
  affineMode: 'preAffine' | 'postAffine'
  is3D?: boolean
  selectedTransformId?: () => string | null
  setSelectedTransformId?: (tid: string | null) => void
}

const COEFS_2D = ['a', 'b', 'c', 'd', 'e', 'f'] as const
const COEFS_3D = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
] as const

export function AffineListEditor(props: AffineListEditorProps) {
  const { theme } = useTheme()
  const timeline = useTimeline()

  const readableIds = createMemo(() => buildReadableIds(props.transforms))
  const activeCoefs = createMemo(() => (props.is3D ? COEFS_3D : COEFS_2D))

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
                <Show when={timeline?.animationEnabled()}>
                  <span class={ui.transformLabel}>
                    {readableIds().transformLabel[tid]}
                  </span>
                </Show>
                <DiceButton
                  title="Randomize affine coefs"
                  onClick={() => {
                    props.setTransforms((draft) => {
                      const coefs = draft[tid]![props.affineMode]
                      for (const key of activeCoefs()) {
                        coefs[key] = randomizeAffineCoef(
                          coefs[key] ?? (['a', 'e', 'i'].includes(key) ? 1 : 0),
                          key,
                        )
                      }
                    })
                  }}
                />
                <ResetButton
                  title="Reset affine to identity (no scale/rotation/offset)"
                  onClick={() => {
                    props.setTransforms((draft) => {
                      const coefs = draft[tid]![props.affineMode]
                      for (const key of activeCoefs()) {
                        coefs[key] = ['a', 'e', 'i'].includes(key) ? 1 : 0
                      }
                    })
                  }}
                />
              </div>
              <div class={ui.coefficients}>
                <For each={activeCoefs()}>
                  {(key) => (
                    <ScrubInput
                      label={key}
                      value={
                        transform[props.affineMode][key] ??
                        (['a', 'e', 'i'].includes(key) ? 1 : 0)
                      }
                      step={0.001}
                      onInput={(val) => {
                        props.setTransforms((draft) => {
                          draft[tid]![props.affineMode][key] = val
                        })
                      }}
                      dataParameterPath={`transform.${tid}.${props.affineMode}.${key}`}
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
