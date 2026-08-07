import { createMemo, For, Show } from 'solid-js'
import { vec2f } from 'typegpu/data'
import { DiceButton } from '@/components/DiceButton/DiceButton'
import { handleColor } from '@/components/FlameColorEditor/FlameColorEditor'
import { ResetButton } from '@/components/ResetButton/ResetButton'
import { ScrubInput } from '@/components/Sliders/ScrubInput'
import { TrackChangesDiamond } from '@/components/Timeline/TrackChangesDiamond'
import { useTheme } from '@/contexts/ThemeContext'
import { useTimeline } from '@/contexts/TimelineContext'
import { randomizeAffineCoef } from '@/flame/randomize'
import { keyframeChangedParams } from '@/utils/keyframeOnChange'
import { buildReadableIds } from '@/utils/readableIds'
import { recordEntries } from '@/utils/record'
import { sortedTransformEntries } from '@/utils/transformOrder'
import ui from './AffineListEditor.module.css'
import type { AffineParams } from '@/flame/affineTranform'
import type { TransformRecord } from '@/flame/schema/flameSchema'
import type { HistorySetter } from '@/utils/createStoreHistory'

export type AffineListEditorProps = {
  transforms: TransformRecord
  setTransforms: HistorySetter<TransformRecord>
  /**
   * Apply an affine edit semantically, so a recording captures it as a
   * replayable step (docs/plans/semantic-recorder-plan.md). Absent for
   * preview copies, which fall back to the raw setter.
   */
  setTransformAffine?: (
    tid: string,
    which: 'pre' | 'post',
    affine: AffineParams,
  ) => void
  affineMode: 'preAffine' | 'postAffine'
  is3D?: boolean
  selectedTransformId?: () => string | null
  setSelectedTransformId?: (tid: string | null) => void
  /** Gate for the track-changes diamond + dice keyframing. Only editors bound
   *  to the real flame pass true — the variation modal edits a PREVIEW flame
   *  whose paths would resolve against the real one and write junk tracks. */
  enableChangeTracking?: boolean
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

  /** Apply a whole affine for one transform: semantic dispatch when the host
   *  provides one, raw setter otherwise. */
  const applyAffine = (
    tid: string,
    next: (coefs: Record<string, number>) => void,
  ) => {
    const dispatch = props.setTransformAffine
    if (dispatch) {
      const current = props.transforms[tid as keyof TransformRecord]?.[
        props.affineMode
      ] as Record<string, number> | undefined
      if (!current) return
      const draft = { ...current }
      next(draft)
      // The draft is a copy of the transform's own affine with the same
      // keys, so it satisfies the 2D/3D coefficient shape by construction.
      dispatch(
        tid,
        props.affineMode === 'postAffine' ? 'post' : 'pre',
        draft as unknown as AffineParams,
      )
    } else {
      props.setTransforms((store) => {
        next(store[tid as keyof TransformRecord]![props.affineMode])
      })
    }
  }
  const activeCoefs = createMemo(() => (props.is3D ? COEFS_3D : COEFS_2D))

  return (
    <div class={ui.container}>
      <Show when={props.enableChangeTracking && timeline?.animationEnabled()}>
        <TrackChangesDiamond />
      </Show>
      <For each={sortedTransformEntries(recordEntries(props.transforms))}>
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
              onContextMenu={(e) => {
                // Right-click / long-press deselects.
                e.preventDefault()
                props.setSelectedTransformId?.(null)
              }}
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
                    // Rolled here so the recorded action carries the result.
                    applyAffine(tid, (coefs) => {
                      for (const key of activeCoefs()) {
                        coefs[key] = randomizeAffineCoef(
                          coefs[key] ?? (['a', 'e', 'i'].includes(key) ? 1 : 0),
                          key,
                        )
                      }
                    })
                    if (props.enableChangeTracking) {
                      keyframeChangedParams(
                        timeline,
                        activeCoefs().map(
                          (key) =>
                            `transform.${tid}.${props.affineMode}.${key}`,
                        ),
                      )
                    }
                  }}
                />
                <ResetButton
                  title="Reset affine to identity (no scale/rotation/offset)"
                  onClick={() => {
                    applyAffine(tid, (coefs) => {
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
                        applyAffine(tid, (coefs) => {
                          coefs[key] = val
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
