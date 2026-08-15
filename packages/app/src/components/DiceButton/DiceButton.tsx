import { Shuffle } from '@/icons'
import ui from './DiceButton.module.css'

export function DiceButton(props: {
  onClick: () => void
  title?: string
  class?: string
  focusId?: string
}) {
  return (
    <button
      class={ui.diceButton}
      classList={{ [props.class ?? '']: true }}
      onClick={props.onClick}
      title={props.title ?? 'Randomize'}
      data-focus-id={props.focusId}
    >
      <Shuffle />
    </button>
  )
}
