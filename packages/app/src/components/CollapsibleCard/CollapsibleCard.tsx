import { createSignal } from 'solid-js'
import { ChevronDown } from '@/icons'
import ui from './CollapsibleCard.module.css'
import type { ParentProps } from 'solid-js'

export function CollapsibleCard(
  props: ParentProps<{ title: string; defaultOpen?: boolean; class?: string }>,
) {
  const [isOpen, setIsOpen] = createSignal(props.defaultOpen ?? true)
  return (
    <div
      class={ui.card}
      classList={{
        [props.class ?? '']: true,
        [ui.collapsed!]: !isOpen(),
      }}
    >
      <button class={ui.header} onClick={() => setIsOpen((p) => !p)}>
        <span class={ui.title}>{props.title}</span>
        <ChevronDown
          class={ui.chevron}
          classList={{ [ui.chevronOpen!]: isOpen() }}
        />
      </button>
      {isOpen() && <div class={ui.content}>{props.children}</div>}
    </div>
  )
}
