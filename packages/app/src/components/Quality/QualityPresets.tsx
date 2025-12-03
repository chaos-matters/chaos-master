import { For } from 'solid-js'
import { DEFAULT_ULTRA_QUALITY } from '@/defaults'
import { recordKeys } from '@/utils/record'
import ui from './QualityPresets.module.css'
import type { Setter } from 'solid-js'

export const qualityPresets = {
  low: 0.75,
  mid: 0.85,
  high: 0.95,
  ultra: DEFAULT_ULTRA_QUALITY,
} satisfies Record<string, number>
export type QualityPreset = keyof typeof qualityPresets

type QualityPresetsProps = {
  selectedPreset: QualityPreset
  setQualityPreset: Setter<QualityPreset>
  fillPercentage: number
}

export function getPresetFromQuality(
  q: number,
  fallback: QualityPreset = 'high',
): QualityPreset {
  const entries = Object.entries(qualityPresets) as [QualityPreset, number][]
  return entries.find(([, v]) => v === q)?.[0] ?? fallback
}

export function QualityPresets(props: QualityPresetsProps) {
  return (
    <div class={ui.pillsContainer}>
      <For each={recordKeys(qualityPresets)}>
        {(presetName) => {
          const isSelected = () => presetName === props.selectedPreset
          const fillPercent = () =>
            isSelected() ? Math.min(100, Math.max(0, props.fillPercentage)) : 0
          return (
            <button
              onClick={() => {
                props.setQualityPreset(presetName)
              }}
              class={ui.pill}
              classList={{
                [ui.selectedPill]: isSelected(),
              }}
              style={{
                '--fill-percent': `${fillPercent()}%`,
              }}
            >
              {presetName}
            </button>
          )
        }}
      </For>
    </div>
  )
}
