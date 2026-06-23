import { createSignal, For, Show } from 'solid-js'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import ui from './DocumentationModal.module.css'
import { VariationDocsTab } from './VariationDocsTab'
import type { HardwareTier } from '@/utils/hardwareTier'

type DocTab = 'variations' | 'ifs' | 'api'

const TABS: { id: DocTab; label: string }[] = [
  { id: 'variations', label: 'Variations' },
  { id: 'ifs', label: 'IFS' },
  { id: 'api', label: 'API' },
]

type DocumentationModalProps = {
  respond: () => void
  hardwareTier: () => HardwareTier | null
}

function DocumentationModal(props: DocumentationModalProps) {
  const [tab, setTab] = createSignal<DocTab>('variations')

  return (
    <div class={ui.modalRoot}>
      <ModalTitleBar onClose={props.respond}>Documentation</ModalTitleBar>

      <div class={ui.tabBar}>
        <For each={TABS}>
          {(t) => (
            <button
              class={ui.tab}
              classList={{ [ui.tabActive!]: tab() === t.id }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          )}
        </For>
      </div>

      <div class={ui.tabBody}>
        <Show when={tab() === 'variations'}>
          <VariationDocsTab hardwareTier={props.hardwareTier} />
        </Show>
        <Show when={tab() === 'ifs'}>
          <ComingSoon name="IFS" />
        </Show>
        <Show when={tab() === 'api'}>
          <ComingSoon name="API" />
        </Show>
      </div>
    </div>
  )
}

function ComingSoon(props: { name: string }) {
  return (
    <div class={ui.placeholder}>
      <p>{props.name} documentation is coming soon.</p>
    </div>
  )
}

/**
 * Factory mirroring `createShowHelp`: call once during render (so it can read
 * the modal context), returns a launcher for the documentation modal.
 */
export function createShowDocumentation(opts: {
  hardwareTier: () => HardwareTier | null
}) {
  const requestModal = useRequestModal()

  return async function showDocumentation() {
    await requestModal({
      class: ui.documentationModal,
      content: ({ respond }) => (
        <DocumentationModal
          respond={respond}
          hardwareTier={opts.hardwareTier}
        />
      ),
    })
  }
}
