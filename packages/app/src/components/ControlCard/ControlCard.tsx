import ui from './ControlCard.module.css'
import type { ParentProps } from 'solid-js'

export function Card(props: ParentProps<{ class?: string }>) {
  return (
    <div class={[ui.content, props.class]}>
      {props.children}
    </div>
  )
}
