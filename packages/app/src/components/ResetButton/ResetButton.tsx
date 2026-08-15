import { Reset } from '@/icons'
import ui from './ResetButton.module.css'

export function ResetButton(props: {
  onClick: () => void
  title?: string
  class?: string
  focusId?: string
}) {
  return (
    <button
      class={ui.resetButton}
      classList={{ [props.class ?? '']: true }}
      onClick={props.onClick}
      title={props.title ?? 'Reset'}
      data-focus-id={props.focusId}
    >
      <Reset />
    </button>
  )
}
