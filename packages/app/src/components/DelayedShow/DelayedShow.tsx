import { createEffect, createSignal, onCleanup, Show } from 'solid-js'
import type { JSX, ParentProps } from 'solid-js'

type DelayedShowProps = {
  delayMs: number
  fallback?: JSX.Element
}

/**
 * Delays showing the component by a certain amount
 */
export function DelayedShow(props: ParentProps<DelayedShowProps>) {
  const [show, setShow] = createSignal(false)
  createEffect(() => {
    const timeoutId = setTimeout(() => {
      setShow(true)
    }, props.delayMs)
    onCleanup(() => {
      clearTimeout(timeoutId)
    })
  })
  return (
    <Show when={show()} fallback={props.fallback}>
      {props.children}
    </Show>
  )
}
