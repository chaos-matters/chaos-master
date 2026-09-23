/**
 * The Arcade screen lock's shield, over everything while the agent drives.
 *
 * A modal `<dialog>` portalled under `<body>` and held in the browser's top
 * layer (topLayer.ts): above every other modal, the rest of the page inert,
 * and the focus in it, so no control the viewer had focused keeps the
 * keyboard, and no listener past it hears a key. Back does nothing under it.
 * When it goes it hands `onRelease` that control, for whoever takes the focus
 * next.
 */
import { onCleanup, onMount } from 'solid-js'
import { Portal } from 'solid-js/web'
import { holdBack } from '@/lib/backStack'
import { holdKeys, holdTopLayer } from './topLayer'
import type { ParentProps } from 'solid-js'

export function LockShield(
  props: ParentProps<{
    class?: string
    label: string
    onRelease: (focusBefore: HTMLElement | undefined) => void
  }>,
) {
  let shield!: HTMLDialogElement
  let portal!: HTMLDivElement
  onMount(() => {
    const active = document.activeElement
    const focusBefore =
      active instanceof HTMLElement && active !== document.body
        ? active
        : undefined
    const releases = [holdTopLayer(shield), holdKeys(portal), holdBack()]
    onCleanup(() => {
      for (const release of releases) release()
      props.onRelease(focusBefore)
    })
  })
  return (
    <Portal ref={portal}>
      <dialog
        ref={shield}
        class={props.class}
        aria-label={props.label}
        tabIndex={-1}
        // Escape is the pilot's own (PilotOverlay), and nothing else closes it.
        onCancel={(ev) => {
          ev.preventDefault()
        }}
      >
        {props.children}
      </dialog>
    </Portal>
  )
}
