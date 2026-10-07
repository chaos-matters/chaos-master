import { createSignal, For, Show } from 'solid-js'
import { Book, ShapeTriangle, Terminal, VariationSpiral } from '@/icons'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import { ApiGuideTab } from './ApiGuideTab'
import ui from './DocumentationModal.module.css'
import { IfsGuideTab } from './IfsGuideTab'
import { VariationDocsTab } from './VariationDocsTab'
import type { Component } from 'solid-js'
import type { HardwareTier } from '@/utils/hardwareTier'

type DocTab = 'variations' | 'ifs' | 'api'

type TabConfig = {
  id: DocTab
  label: string
  icon: Component<{ width?: string; height?: string; class?: string }>
}

const TABS: TabConfig[] = [
  { id: 'variations', label: 'Variations', icon: VariationSpiral },
  { id: 'ifs', label: 'IFS Mathematics', icon: ShapeTriangle },
  { id: 'api', label: 'WebGPU & API', icon: Terminal },
]

type DocumentationModalProps = {
  respond: () => void
  hardwareTier: () => HardwareTier | null
}

function DocumentationModal(props: DocumentationModalProps) {
  const [tab, setTab] = createSignal<DocTab>('variations')

  return (
    <div class={ui.modalRoot}>
      <ModalTitleBar onClose={props.respond}>
        <div class={ui.titleArea}>
          <div class={ui.titleIconBadge}>
            <Book width="1.15rem" height="1.15rem" />
          </div>
          <div class={ui.titleTextGroup}>
            <div class={ui.titleRow}>
              <span class={ui.titleMain}>Documentation</span>
              <span class={ui.titleBadge}>Catalog &amp; Reference</span>
            </div>
            <span class={ui.titleSubtitle}>
              Fractal flame variation catalog, IFS mathematics &amp; WebGPU
              pipeline
            </span>
          </div>
        </div>
      </ModalTitleBar>

      <div class={ui.tabBar} role="tablist">
        <For each={TABS}>
          {(t) => {
            const Icon = t.icon
            return (
              <button
                role="tab"
                aria-selected={tab() === t.id}
                class={ui.tab}
                classList={{ [ui.tabActive!]: tab() === t.id }}
                onClick={() => setTab(t.id)}
              >
                <span class={ui.tabIcon}>
                  <Icon width="14" height="14" />
                </span>
                <span>{t.label}</span>
              </button>
            )
          }}
        </For>
      </div>

      <div class={ui.tabBody}>
        <Show when={tab() === 'variations'}>
          <VariationDocsTab hardwareTier={props.hardwareTier} />
        </Show>
        <Show when={tab() === 'ifs'}>
          <IfsGuideTab />
        </Show>
        <Show when={tab() === 'api'}>
          <ApiGuideTab />
        </Show>
      </div>
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
