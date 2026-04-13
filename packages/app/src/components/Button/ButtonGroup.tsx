import ui from './Button.module.css'
import type { ParentProps } from 'solid-js'

type ButtonGroupProps = {
  class?: string
}

export function ButtonGroup(props: ParentProps<ButtonGroupProps>) {
  return (
    <div class={[ui.buttonGroup, props.class]}>
      {props.children}
    </div>
  )
}
