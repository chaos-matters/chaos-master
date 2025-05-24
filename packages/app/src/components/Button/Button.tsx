import { splitProps } from 'solid-js'
import ui from './Button.module.css'
import type { JSX } from 'solid-js'

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
}

export function Button(props: ButtonProps) {
  const [c, attrs] = splitProps(props, ['children', 'class', 'active'])
  return (
    <button
      class={`${c.class ?? ''} ${ui.button} ${c.active === true ? ui.active : ''}`}
      {...attrs}
    >
      {c.children}
    </button>
  )
}
