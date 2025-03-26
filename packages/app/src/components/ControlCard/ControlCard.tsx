import { ParentProps } from 'solid-js'
import ui from './ControlCard.module.css'

export function Card(props: ParentProps<{ class?: string }>) {
  return (
    <div class={ui.container}>
      <div class={ui.content} classList={{ [props.class ?? '']: true }}>
        {props.children}
      </div>
    </div>
  )
}
