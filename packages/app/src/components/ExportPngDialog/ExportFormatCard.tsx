import { createMemo, For } from 'solid-js'
import { computeExportDimensions, EXPORT_ASPECTS, EXPORT_RESOLUTIONS, } from '@/utils/exportDimensions'
import ui from './ExportFormatCard.module.css'
import type { ExportAspectKey } from '@/utils/exportDimensions'

type ExportFormatCardProps = {
  resolution: number
  onResolutionChange: (v: number) => void
  aspect: ExportAspectKey
  onAspectChange: (v: ExportAspectKey) => void
  /** Current viewport aspect (width / height), used to resolve "Auto". */
  viewportAspect: number
}

/**
 * Shared resolution (longest edge) + aspect-ratio picker for the export dialog.
 * Used by both the image and animation tabs so the two stay in lockstep.
 */
export function ExportFormatCard(props: ExportFormatCardProps) {
  const dimensions = createMemo(() =>
    computeExportDimensions(
      props.resolution,
      props.aspect,
      props.viewportAspect,
    ),
  )

  return (
    <div class={ui.root}>
      <div class={ui.group}>
        <span class={ui.groupLabel}>Resolution</span>
        <div class={ui.cards}>
          <For each={EXPORT_RESOLUTIONS}>
            {(res) => (
              <button
                type="button"
                class={ui.card}
                classList={{
                  [ui.cardActive as string]: props.resolution === res.value,
                }}
                onClick={() => {
                  props.onResolutionChange(res.value)
                }}
                title={`${res.value}px on the longest edge`}
              >
                {res.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <div class={ui.group}>
        <span class={ui.groupLabel}>Aspect</span>
        <div class={ui.cards}>
          <For each={EXPORT_ASPECTS}>
            {(asp) => (
              <button
                type="button"
                class={ui.card}
                classList={{
                  [ui.cardActive as string]: props.aspect === asp.key,
                }}
                onClick={() => {
                  props.onAspectChange(asp.key)
                }}
              >
                {asp.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <span class={ui.dimensions}>
        Output: {dimensions().width} &times; {dimensions().height} px
      </span>
    </div>
  )
}
