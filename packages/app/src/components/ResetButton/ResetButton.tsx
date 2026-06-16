import { Reset } from '@/icons'
import ui from './ResetButton.module.css'

export function ResetButton(props: {
  onClick: () => void
  title?: string
  class?: string
}) {
  return (
    <button
      class={ui.resetButton}
      classList={{ [props.class ?? '']: true }}
      onClick={props.onClick}
      title={props.title ?? 'Reset'}
    >
      <Reset />
    </button>
  )
}
