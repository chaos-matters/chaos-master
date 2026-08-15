import { createMemo, For, Show } from 'solid-js'
import { vec2f } from 'typegpu/data'
// Reuse the affine list's styling so the two scrub views look consistent.
import ui from '@/components/AffineEditor/AffineListEditor.module.css'
import { DiceButton } from '@/components/DiceButton/DiceButton'
import { ResetButton } from '@/components/ResetButton/ResetButton'
import { ScrubInput } from '@/components/Sliders/ScrubInput'
import { TrackChangesDiamond } from '@/components/Timeline/TrackChangesDiamond'
import { useTheme } from '@/contexts/ThemeContext'
import { useTimeline } from '@/contexts/TimelineContext'
import { randomRange } from '@/flame/randomize'
import { colorFocusId, colorRandomizeFocusId, colorResetFocusId, } from '@/recorder/focusIds'
import { keyframeChangedParams } from '@/utils/keyframeOnChange'
import { buildReadableIds } from '@/utils/readableIds'
import { recordEntries } from '@/utils/record'
import { sortedTransformEntries } from '@/utils/transformOrder'
import { handleColor } from './FlameColorEditor'
import type { ColorEditOrigin } from './FlameColorEditor'
import type { TransformId, TransformRecord } from '@/flame/schema/flameSchema'
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
  /**
   * Apply a colour edit semantically, so a recording captures it as a
   * replayable step (docs/plans/semantic-recorder-plan.md). Absent for
   * preview copies, which fall back to the raw setter.
   */
  setTransformColor?: (
    tid: string,
    x: number,
    y: number,
    origin?: ColorEditOrigin,
  ) => void
  selectedTransformId?: () => string | null
  setSelectedTransformId?: (tid: string | null) => void
  /** Gate for the track-changes diamond + dice keyframing (real flame only). */
  enableChangeTracking?: boolean
}) {
  const { theme } = useTheme()
  const timeline = useTimeline()
  const readableIds = createMemo(() => buildReadableIds(props.transforms))

  /** Semantic dispatch when the host provides one, raw setter otherwise. */
  const setColor = (
    tid: TransformId,
    x: number,
    y: number,
    origin: ColorEditOrigin,
  ) => {
    const applySemantically = props.setTransformColor
    if (applySemantically) {
      applySemantically(tid, x, y, origin)
    } else {
      props.setTransforms((draft) => {
        draft[tid]!.color = { x, y }
      })
    }
  }

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
              data-focus-id={colorFocusId(tid)}
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
                <span class={ui.transformLabel}>
                  {readableIds().transformLabel[tid]}
                </span>
                <DiceButton
                  title="Randomize color"
                  focusId={colorRandomizeFocusId(tid)}
                  onClick={() => {
                    // Rolled here, so the recorded action carries the result
                    // and replay needs no seed.
                    const next = {
                      x: randomRange(-0.4, 0.4),
                      y: randomRange(-0.4, 0.4),
                    }
                    setColor(tid, next.x, next.y, 'randomize')
                    if (props.enableChangeTracking) {
                      keyframeChangedParams(timeline, [
                        `transform.${tid}.color.x`,
                        `transform.${tid}.color.y`,
                      ])
                    }
                  }}
                />
                <ResetButton
                  title="Reset color to neutral (0, 0)"
                  focusId={colorResetFocusId(tid)}
                  onClick={() => {
                    setColor(tid, 0, 0, 'reset')
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
                        // The command takes both components, so the one not
                        // being scrubbed is carried through unchanged.
                        setColor(
                          tid,
                          comp.key === 'x' ? val : transform.color.x,
                          comp.key === 'y' ? val : transform.color.y,
                          comp.key,
                        )
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
