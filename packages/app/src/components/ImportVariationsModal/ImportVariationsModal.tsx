import { createSignal, For, Show } from 'solid-js'
import { Button } from '../Button/Button'
import { Checkbox } from '../Checkbox/Checkbox'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import ui from './ImportVariations.module.css'
import type { CustomVariationDef } from '@/flame/variations/custom'

type ImportVariationsModalProps = {
  imported: CustomVariationDef[]
  alreadyOwned: CustomVariationDef[]
  /** Selected ids to save, or null when the user declines. */
  respond: (selectedIds: string[] | null) => void
}

/**
 * Asks the recipient of a shared flame which custom variations to save into
 * their permanent library. Everything is already usable this session (registered
 * transiently); this is purely the consent + selection step before persisting.
 * Variations whose code the recipient already has are shown separately and never
 * re-saved. Names render as text (Solid escapes by default) — never as HTML — so
 * an attacker-chosen name can't inject markup.
 */
function ImportVariationsModal(props: ImportVariationsModalProps) {
  // Default: everything selected.
  const [selected, setSelected] = createSignal<Set<string>>(
    new Set(props.imported.map((d) => d.id)),
  )

  const isSelected = (id: string) => selected().has(id)

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }
  const allSelected = () => selected().size === props.imported.length

  function toggleAll(on: boolean) {
    setSelected(
      on ? new Set(props.imported.map((d) => d.id)) : new Set<string>(),
    )
  }
  const selectedCount = () => selected().size

  return (
    <>
      <ModalTitleBar
        onClose={() => {
          props.respond(null)
        }}
      >
        Custom variations included
      </ModalTitleBar>
      <div class={ui.content}>
        <p class={ui.note}>
          This shared flame includes {props.imported.length} custom variation
          {props.imported.length === 1 ? '' : 's'}. They are already active for
          this session — pick which to save to your library.
        </p>

        <Show when={props.imported.length > 1}>
          <label class={ui.selectAll}>
            <Checkbox
              checked={allSelected()}
              onChange={(on) => {
                toggleAll(on)
              }}
            />
            <span>Select all</span>
          </label>
        </Show>

        <ul class={ui.pillList}>
          <For each={props.imported}>
            {(def) => (
              <li>
                <label
                  class={ui.pill}
                  classList={{ [ui.pillOn as string]: isSelected(def.id) }}
                >
                  <Checkbox
                    checked={isSelected(def.id)}
                    onChange={(on) => {
                      toggle(def.id, on)
                    }}
                  />
                  <span class={ui.pillName}>{def.name}</span>
                </label>
              </li>
            )}
          </For>
        </ul>

        <Show when={props.alreadyOwned.length > 0}>
          <p class={ui.ownedHeading}>
            Already in your library ({props.alreadyOwned.length}) — kept as-is:
          </p>
          <ul class={ui.pillList}>
            <For each={props.alreadyOwned}>
              {(def) => (
                <li>
                  <span class={`${ui.pill} ${ui.pillOwned}`}>
                    <span class={ui.pillName}>{def.name}</span>
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
      <footer class={ui.footer}>
        <Button
          onClick={() => {
            props.respond(null)
          }}
        >
          Not now
        </Button>
        <Button
          disabled={selectedCount() === 0}
          onClick={() => {
            props.respond([...selected()])
          }}
        >
          {selectedCount() === props.imported.length
            ? 'Save all'
            : `Save ${selectedCount()}`}
        </Button>
      </footer>
    </>
  )
}

export function createImportVariationsModal() {
  const requestModal = useRequestModal()

  /** Resolves the ids the user chose to save, or null if they declined. */
  async function showImportVariationsModal(
    imported: CustomVariationDef[],
    alreadyOwned: CustomVariationDef[] = [],
  ): Promise<string[] | null> {
    return requestModal<string[] | null>({
      class: ui.container,
      content: ({ respond }) => (
        <ImportVariationsModal
          imported={imported}
          alreadyOwned={alreadyOwned}
          respond={respond}
        />
      ),
    })
  }

  return { showImportVariationsModal }
}
