import { createSignal, For, Show } from 'solid-js'
import { categoryOf } from '@/flame/variationRegistry'
import { CATEGORY_LABELS, sortByCategory } from '@/flame/variations/categories'
import { getNormalizedVariationName } from '@/flame/variations/utils'
import styles from './VariationMultiSelect.module.css'
import type { Dims } from '@/flame/variationRegistry'
import type { TransformVariationType } from '@/flame/variations'
import type { VariationCategory } from '@/flame/variations/categories'

const MIN_SELECTED = 2

export interface VariationMultiSelectProps {
  /** Which registry the variation types belong to (2D or 3D). */
  dims: Dims
  allVariations: TransformVariationType[]
  selected: Set<TransformVariationType>
  onToggle: (type: TransformVariationType) => void
  onSelectAll: () => void
  onDeselectAll: () => void
}

interface VariationGroup {
  category: VariationCategory
  label: string
  types: TransformVariationType[]
}

type GroupState = 'all' | 'some' | 'none'

function byName(a: TransformVariationType, b: TransformVariationType): number {
  return getNormalizedVariationName(a).localeCompare(
    getNormalizedVariationName(b),
  )
}

export function VariationMultiSelect(props: VariationMultiSelectProps) {
  const [collapsed, setCollapsed] = createSignal<Set<VariationCategory>>(
    new Set(),
  )

  const groups = (): VariationGroup[] => {
    const byCategory = new Map<VariationCategory, TransformVariationType[]>()
    for (const type of props.allVariations) {
      const category = categoryOf(props.dims, type) ?? 'general'
      const existing = byCategory.get(category)
      if (existing) {
        existing.push(type)
      } else {
        byCategory.set(category, [type])
      }
    }
    return [...byCategory.entries()]
      .map(([category, types]) => ({
        category,
        label: CATEGORY_LABELS[category],
        types: [...types].sort(byName),
      }))
      .sort((a, b) => sortByCategory(a.category, b.category))
  }

  const isCollapsed = (category: VariationCategory) => collapsed().has(category)
  const toggleCollapsed = (category: VariationCategory) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })

  const selectedInGroup = (group: VariationGroup) =>
    group.types.filter((type) => props.selected.has(type)).length

  const groupState = (group: VariationGroup): GroupState => {
    const n = selectedInGroup(group)
    if (n === 0) return 'none'
    if (n === group.types.length) return 'all'
    return 'some'
  }

  const toggleGroup = (group: VariationGroup) => {
    if (groupState(group) === 'all') {
      // Deselect this group's members, but never drop below MIN_SELECTED total.
      let removable = props.selected.size - MIN_SELECTED
      for (const type of group.types) {
        if (removable <= 0) break
        if (props.selected.has(type)) {
          props.onToggle(type)
          removable--
        }
      }
    } else {
      // Select every not-yet-selected member.
      for (const type of group.types) {
        if (!props.selected.has(type)) props.onToggle(type)
      }
    }
  }

  const canDeselectPill = (type: TransformVariationType) =>
    props.selected.has(type) && props.selected.size > MIN_SELECTED

  return (
    <div class={styles.container}>
      <div class={styles.scrollArea}>
        <For each={groups()}>
          {(group) => (
            <div class={styles.group}>
              <div class={styles.groupHeader}>
                <button
                  type="button"
                  class={styles.groupCheckbox}
                  classList={{
                    [styles.checkAll!]: groupState(group) === 'all',
                    [styles.checkSome!]: groupState(group) === 'some',
                  }}
                  title={`Toggle all ${group.label} variations`}
                  onClick={() => {
                    toggleGroup(group)
                  }}
                >
                  <Show when={groupState(group) === 'all'}>✓</Show>
                  <Show when={groupState(group) === 'some'}>–</Show>
                </button>
                <button
                  type="button"
                  class={styles.groupLabel}
                  title={isCollapsed(group.category) ? 'Expand' : 'Collapse'}
                  onClick={() => toggleCollapsed(group.category)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class={styles.chevron}
                    classList={{
                      [styles.chevronCollapsed!]: isCollapsed(group.category),
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <span class={styles.groupName}>{group.label}</span>
                  <span class={styles.groupCount}>
                    {selectedInGroup(group)}/{group.types.length}
                  </span>
                </button>
              </div>
              <Show when={!isCollapsed(group.category)}>
                <div class={styles.pillGrid}>
                  <For each={group.types}>
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
                          title={name}
                          onClick={() => {
                            if (isSelected() && !canDeselectPill(type)) return
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
              </Show>
            </div>
          )}
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
