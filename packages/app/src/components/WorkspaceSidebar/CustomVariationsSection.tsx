import { For, Show } from 'solid-js'
import ui from '@/App.module.css'
import { CollapsibleCard } from '@/components/CollapsibleCard/CollapsibleCard'
import { BoxArrowRight, Plus, Share } from '@/icons'
import type { Accessor } from 'solid-js'
import type { CustomVariationDef } from '@/flame/variations/custom/types'

export interface CustomVariationsSectionProps {
  is3D: boolean
  customVariationsList: Accessor<CustomVariationDef[]>
  hoveredCustomVarDef: Accessor<CustomVariationDef | null>
  setHoveredCustomVarDef: (def: CustomVariationDef | null) => void
  onOpenCustomVariationEditor: (def?: CustomVariationDef) => void
  onAddTransform: (defId: string) => void
  onShareVariationLink: (def: CustomVariationDef) => void
  onDuplicateCustomVariation: (id: string) => void
  onDeleteCustomVariation: (def: CustomVariationDef) => void
}

export function CustomVariationsSection(props: CustomVariationsSectionProps) {
  return (
    <Show when={!props.is3D}>
      <CollapsibleCard title="Custom Variations" defaultOpen={false}>
        <For
          each={props.customVariationsList()}
          fallback={
            <div class={ui.customVarEmpty}>No custom variations yet</div>
          }
        >
          {(def) => (
            <div
              class={ui.customVarItem}
              onContextMenu={(e) => {
                e.preventDefault()
              }}
              onMouseEnter={() => {
                props.setHoveredCustomVarDef(def)
              }}
              onMouseLeave={() => {
                props.setHoveredCustomVarDef(null)
              }}
              onClick={() => {
                props.onOpenCustomVariationEditor(def)
              }}
            >
              <span class={ui.customVarItemName}>{def.name}</span>
              <div class={ui.customVarItemActions}>
                <button
                  class={ui.customVarItemBtn}
                  classList={{
                    [ui.customVarItemBtnPrimary as string]: true,
                  }}
                  title="Add to flame"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.setHoveredCustomVarDef(null)
                    props.onAddTransform(def.id)
                  }}
                >
                  <BoxArrowRight />
                </button>
                <button
                  class={ui.customVarItemBtn}
                  title="Share variation link"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.setHoveredCustomVarDef(null)
                    props.onShareVariationLink(def)
                  }}
                >
                  <Share />
                </button>
                <button
                  class={ui.customVarItemBtn}
                  title="Duplicate"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onDuplicateCustomVariation(def.id)
                  }}
                >
                  ⧉
                </button>
                <button
                  class={ui.customVarItemBtn}
                  classList={{
                    [ui.customVarItemBtnDanger as string]: true,
                  }}
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onDeleteCustomVariation(def)
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          )}
        </For>
        <button
          class={ui.customVarsButton}
          onClick={() => {
            props.onOpenCustomVariationEditor()
          }}
          title="Create a new custom variation"
        >
          <Plus />
          <span>Create Variation</span>
        </button>
      </CollapsibleCard>
    </Show>
  )
}
