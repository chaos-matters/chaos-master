import { createSignal, Show } from 'solid-js'
import { Check, Copy } from '@/icons'
import ui from './DocumentationModal.module.css'

/** Read-only, scrollable code display for the doc modal with language badge & copy button. */
export function CodeBlock(props: { code: string; language?: string }) {
  const [copied, setCopied] = createSignal(false)

  const handleCopy = () => {
    if (globalThis.navigator?.clipboard) {
      void globalThis.navigator.clipboard.writeText(props.code).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  return (
    <div class={ui.codeContainer}>
      <div class={ui.codeHeader}>
        <span class={ui.codeLanguageBadge}>{props.language ?? 'code'}</span>
        <div class={ui.codeActions}>
          <button
            type="button"
            class={ui.copyButton}
            onClick={handleCopy}
            title="Copy code to clipboard"
          >
            <Show
              when={copied()}
              fallback={
                <>
                  <Copy width="13" height="13" class={ui.copyIcon} />
                  <span>Copy</span>
                </>
              }
            >
              <Check width="13" height="13" class={ui.checkIcon} />
              <span>Copied</span>
            </Show>
          </button>
        </div>
      </div>
      <pre class={ui.codeBlock}>
        <code>{props.code}</code>
      </pre>
    </div>
  )
}
