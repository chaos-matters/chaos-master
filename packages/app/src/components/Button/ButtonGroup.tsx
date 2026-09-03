import ui from './Button.module.css'
import type { ParentProps } from 'solid-js'

type ButtonGroupProps = {
  class?: string
  'data-tour-target'?: string
  /** Follow-cam anchor: the parameter this group of buttons writes. */
  'data-parameter-path'?: string
}

export function ButtonGroup(props: ParentProps<ButtonGroupProps>) {
  return (
    <div
      class={ui.buttonGroup}
      classList={{ [props.class ?? '']: true }}
      data-tour-target={props['data-tour-target']}
      data-parameter-path={props['data-parameter-path']}
    >
      {props.children}
    </div>
  )
}
