import { omit } from 'solid-js'
import ui from './Button.module.css'
import type { JSX } from 'solid-js'

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
}

export function Button(props: ButtonProps) {
  const attrs = omit(props, 'children', 'class', 'active')
  return (
    <button
      class={`${props.class ?? ''} ${ui.button} ${props.active === true ? ui.active : ''}`}
      {...attrs}
    >
      {props.children}
    </button>
  )
}
