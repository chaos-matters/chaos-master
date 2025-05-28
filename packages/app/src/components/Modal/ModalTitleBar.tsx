import { Show } from 'solid-js'
import { Cross } from '@/icons'
import { useKeyboardShortcuts } from '@/utils/useKeyboardShortcuts'
import { Button } from '../Button/Button'
import ui from './ModalTitleBar.module.css'
import type { ParentProps } from 'solid-js'

type ModalTitleBarProps = {
  onClose?: () => void
}

/**
 * Modal title bar which has a close button (if `onClose` provided) for light dismiss.
 * It also allows closing the modal using Esc key.
 */
export function ModalTitleBar(props: ParentProps<ModalTitleBarProps>) {
  useKeyboardShortcuts({
    Escape: () => {
      if (props.onClose) {
        props.onClose()
        return true
      }
    },
  })
  return (
    <h1 class={ui.bar}>
      <span class={ui.title}>{props.children}</span>
      <Show when={props.onClose} keyed>
        {(onClose) => (
          <Button
            class={ui.closeButton}
            onClick={() => {
              onClose()
            }}
          >
            <Cross width="1rem" />
          </Button>
        )}
      </Show>
    </h1>
  )
}
