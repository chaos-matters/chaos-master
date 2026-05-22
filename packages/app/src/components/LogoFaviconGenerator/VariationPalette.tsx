import { For, Show } from 'solid-js'
import { isParametricVariationType } from '@/flame/variations'
import { getNormalizedVariationName } from '@/flame/variations/utils'
import styles from './VariationPalette.module.css'
import type { TransformVariationType } from '@/flame/variations'

const MIN_SELECTED = 2

export interface VariationPaletteProps {
  allVariations: TransformVariationType[]
  selected: Set<TransformVariationType>
  onToggle: (type: TransformVariationType) => void
  onSelectAll: () => void
  onDeselectAll: () => void
}

function sortVariations(
  types: TransformVariationType[],
): TransformVariationType[] {
  return [...types].sort((a, b) => {
    const aParam = isParametricVariationType(a) ? 1 : 0
    const bParam = isParametricVariationType(b) ? 1 : 0
    if (aParam !== bParam) return aParam - bParam
    return getNormalizedVariationName(a).localeCompare(
      getNormalizedVariationName(b),
    )
  })
}

function variationGroup(type: TransformVariationType): string {
  return isParametricVariationType(type) ? 'Parametric' : 'Simple'
}

export function VariationPalette(props: VariationPaletteProps) {
  const sorted = () => sortVariations(props.allVariations)
  const canDeselect = (type: TransformVariationType) =>
    props.selected.has(type) && props.selected.size > MIN_SELECTED

  return (
    <div class={styles.container}>
      <div class={styles.scrollArea}>
        <For each={sorted()}>
          {(type) => {
            const isSelected = () => props.selected.has(type)
            const name = getNormalizedVariationName(type)
            return (
              <button
                type="button"
                class={styles.pill}
                classList={{
                  [styles.selected!]: isSelected(),
                  [styles.deselected!]: !isSelected(),
                }}
                title={`${name} (${variationGroup(type)})`}
                onClick={() => {
                  if (isSelected() && !canDeselect(type)) return
                  props.onToggle(type)
                }}
              >
                <Show when={isSelected()}>
                  <span class={styles.checkmark}>✓</span>
                </Show>
                <span class={styles.pillLabel}>{name}</span>
                <Show when={!isSelected()}>
                  <span class={styles.addIcon}>+</span>
                </Show>
              </button>
            )
          }}
        </For>
      </div>
      <div class={styles.footer}>
        <button
          type="button"
          class={styles.footerBtn}
          onClick={props.onSelectAll}
        >
          Select All
        </button>
        <button
          type="button"
          class={styles.footerBtn}
          classList={{
            [styles.disabled!]: props.selected.size <= MIN_SELECTED,
          }}
          onClick={props.onDeselectAll}
          disabled={props.selected.size <= MIN_SELECTED}
        >
          Deselect All
        </button>
        <span class={styles.footerBadge}>
          {props.selected.size}/{props.allVariations.length}
        </span>
      </div>
    </div>
  )
}
