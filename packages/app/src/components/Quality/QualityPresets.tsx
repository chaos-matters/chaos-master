import { createMemo, For, Show } from 'solid-js'
import { DEFAULT_HIGH_QUALITY, DEFAULT_ULTRA_QUALITY } from '@/defaults'
import { formatPointCount } from '@/utils/formatPointCount'
import ui from './QualityPresets.module.css'

export const qualityPresets = {
  low: 0.75,
  mid: 0.85,
  high: DEFAULT_HIGH_QUALITY,
  ultra: DEFAULT_ULTRA_QUALITY,
} satisfies Record<string, number>
export type QualityPreset = keyof typeof qualityPresets

/** Stable pill definitions for all quality presets — reusable across callers. */
export const defaultPills: QualityPillDef[] = Object.keys(qualityPresets).map(
  (key) => ({ key, label: key }),
)

/** For consumers that want to provide their own pill definitions. */
export type QualityPillDef = {
  key: string
  label: string
}

type QualityPresetsProps = {
  pills: QualityPillDef[]
  selectedKey: string
  onSelect: (key: string) => void
  allPillsFill?: boolean
  currentPoints?: number
  targetPoints?: number
  compact?: boolean
}

export function getPresetFromQuality(
  q: number,
  fallback: QualityPreset = 'high',
): QualityPreset {
  const entries = Object.entries(qualityPresets) as [QualityPreset, number][]
  return entries.find(([, v]) => v === q)?.[0] ?? fallback
}

/** Returns the key of the nearest quality preset to the given value. */
export function getNearestPresetKey(quality: number): string {
  const entries = Object.entries(qualityPresets) as [QualityPreset, number][]
  let nearest = entries[0]![0]
  let nearestDist = Math.abs(quality - entries[0]![1])
  for (let i = 1; i < entries.length; i++) {
    const dist = Math.abs(quality - entries[i]![1])
    if (dist < nearestDist) {
      nearest = entries[i]![0]
      nearestDist = dist
    }
  }
  return nearest
}

export function QualityPresets(props: QualityPresetsProps) {
  const selectedIndex = createMemo(() =>
    props.pills.findIndex((p) => p.key === props.selectedKey),
  )

  const showPoints = () =>
    props.currentPoints !== undefined &&
    props.targetPoints !== undefined &&
    props.targetPoints > 0

  const gridStyle = () => {
    const count = props.pills.length
    return { 'grid-template-columns': `repeat(${count}, 1fr)` }
  }

  return (
    <div
      class={ui.wrapper}
      classList={{ [ui.compactWrapper as string]: props.compact }}
    >
      <div class={ui.pillsContainer} style={gridStyle()}>
        <For each={props.pills}>
          {(pill, index) => {
            const isSelected = () => pill.key === props.selectedKey
            const fillPct = () => {
              const si = selectedIndex()
              if (si === -1) return 0
              if (index() > si) return 0
              if (index() < si) {
                return props.allPillsFill !== false ? 100 : 0
              }
              if (
                props.currentPoints === undefined ||
                props.targetPoints === undefined
              )
                return 0
              return Math.min(
                100,
                Math.max(0, (props.currentPoints / props.targetPoints) * 100),
              )
            }
            return (
              <button
                onClick={() => {
                  props.onSelect(pill.key)
                }}
                class={ui.pill}
                classList={{
                  [ui.selectedPill as string]: isSelected(),
                  [ui.compactPill as string]: props.compact,
                }}
                style={{ '--fill-percent': `${fillPct()}%` }}
              >
                {pill.label}
              </button>
            )
          }}
        </For>
      </div>
      <Show when={showPoints()}>
        <div
          class={ui.pointsRow}
          classList={{ [ui.compactPoints as string]: props.compact }}
        >
          {formatPointCount(props.currentPoints!)} /{' '}
          {formatPointCount(props.targetPoints!)}
        </div>
      </Show>
    </div>
  )
}
