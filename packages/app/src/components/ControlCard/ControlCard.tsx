import ui from './ControlCard.module.css'
import type { ParentProps } from 'solid-js'

export function Card(props: ParentProps<{ class?: string }>) {
  return (
    <div class={ui.container}>
      <div class={ui.content} classList={{ [props.class ?? '']: true }}>
        {props.children}
      </div>
    </div>
  )
}
